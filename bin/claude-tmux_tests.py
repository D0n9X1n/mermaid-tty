#!/usr/bin/env python3
"""Tests for the tmux launcher: the passthrough rewrite, when it applies, and how it runs Claude Code."""
import importlib.util
import os
from pathlib import Path
import signal
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


launcher = load("claude_tmux", ROOT / "claude-tmux.py")
TRANSMIT = b"\x1b_Ga=T,U=1,q=2,f=100,i=7,c=4,r=2,m=1;QUJD\x1b\\"
WRAPPED = b"\x1bPtmux;\x1b\x1b_Ga=T,U=1,q=2,f=100,i=7,c=4,r=2,m=1;QUJD\x1b\x1b\\\x1b\\"


def feed_in_pieces(data, size):
    output = launcher.PassthroughFilter()
    pieces = [output.feed(data[start : start + size]) for start in range(0, len(data), size)]
    return b"".join(pieces) + output.finish()


class PassthroughFilterTests(unittest.TestCase):
    def test_a_kitty_command_is_wrapped_and_its_escapes_doubled(self):
        self.assertEqual(launcher.PassthroughFilter().feed(b"a" + TRANSMIT + b"b"), b"a" + WRAPPED + b"b")

    def test_every_split_point_gives_the_same_output(self):
        # A pty read can end anywhere: inside ESC _ G, inside the payload, between ESC and backslash of its end.
        stream = b"\x1b[1mbold\x1b[0m" + TRANSMIT + b"\x1b_Gm=0,q=2;REVG\x1b\\\x1b[38;5;7m\xf4\x8e\xbb\xae\x1b[39m"
        whole = feed_in_pieces(stream, len(stream))
        for size in range(1, len(stream) + 1):
            self.assertEqual(feed_in_pieces(stream, size), whole, f"pieces of {size}")

        self.assertEqual(whole.count(b"\x1bPtmux;"), 2)

    def test_only_a_kitty_command_standing_alone_is_rewritten(self):
        # Inside tmux passthrough a doubled ESC is content, so an already-wrapped command, kitty or not, is left as it
        # is; so are control strings whose text only looks like a kitty command.
        untouched = [
            WRAPPED,
            launcher.passthrough(b"\x1b]99;i=1;done\x1b\\"),
            b"\x1bPtmux;\x1b\x1b]52;c;YQ==\x07\x1b\\",
            b"\x1b]0;_Gtitle\x07",
            b"\x1b_Xother _G content\x1b\\",
            b"\x1bP1$r_G\x1b\\",
        ]
        for stream in untouched:
            for size in range(1, len(stream) + 1):
                self.assertEqual(feed_in_pieces(stream, size), stream, f"{stream!r} in pieces of {size}")

    def test_an_aborted_string_hands_its_escape_back_to_the_parser(self):
        # An ESC that neither doubles nor ends the string aborts it, and the kitty command it starts is still seen.
        stream = b"\x1b]0;title" + TRANSMIT
        self.assertEqual(feed_in_pieces(stream, len(stream)), b"\x1b]0;title" + WRAPPED)

    def test_other_escape_sequences_pass_untouched_and_without_delay(self):
        output = launcher.PassthroughFilter()
        self.assertEqual(output.feed(b"\x1b]0;title\x07\x1b[2J"), b"\x1b]0;title\x07\x1b[2J")
        self.assertEqual(output.feed(b"tail\x1b"), b"tail")
        self.assertEqual(output.feed(b"[0m"), b"\x1b[0m")
        self.assertEqual(output.feed(b"\x1b["), b"\x1b[")

    def test_a_command_over_the_limit_passes_as_it_came_whatever_the_read_size(self):
        # The decision rests on the command's whole length, so every split of the same stream agrees.
        command = b"\x1b_Gm=1;" + b"A" * (launcher.MAX_HELD_BYTES - 7) + b"B\x1b\\"
        stream = command + b"after" + TRANSMIT
        for size in (65536, len(command) - 2, len(command) - 1, len(command), len(stream)):
            self.assertEqual(feed_in_pieces(stream, size), command + b"after" + WRAPPED, f"pieces of {size}")

    def test_a_command_at_the_limit_is_still_wrapped(self):
        command = b"\x1b_Gm=1;" + b"A" * (launcher.MAX_HELD_BYTES - 9) + b"\x1b\\"
        self.assertEqual(len(command), launcher.MAX_HELD_BYTES)
        self.assertEqual(feed_in_pieces(command, 65536), launcher.passthrough(command))

    def test_whatever_is_held_when_the_stream_ends_is_kept(self):
        for tail in (b"\x1b", b"\x1b_", b"\x1b_Gunfinished", b"\x1b]0;open"):
            self.assertEqual(feed_in_pieces(b"tail" + tail, 1), b"tail" + tail, tail)


class WriteAllTests(unittest.TestCase):
    def test_a_short_write_is_finished(self):
        written = []

        def two_at_a_time(_, data):
            written.append(bytes(data[:2]))
            return min(2, len(data))

        with patch.object(launcher.os, "write", two_at_a_time):
            launcher.write_all(1, b"abcdef")

        self.assertEqual(b"".join(written), b"abcdef")


class ShouldWrapTests(unittest.TestCase):
    def answers(self, passthrough="on", client="kitty SonicTerm 1.4.0", refreshed="", session=""):
        asked = []
        replies = {
            ("display-message", "-p", "#{allow-passthrough}"): passthrough,
            ("display-message", "-p", "#{client_termtype}"): client,
            ("show-options", "-gv", "update-environment"): refreshed,
            ("show-environment", "TERM_PROGRAM"): session,
        }

        def ask(command, arguments):
            asked.append(command)
            return replies[tuple(arguments)]

        return ask, asked

    def test_wraps_in_tmux_with_passthrough_for_an_image_terminal(self):
        for client in ("kitty SonicTerm 1.4.0", "kitty(0.42.1)", "ghostty 1.3.1", "Ghostty 1.2.0"):
            ask, _ = self.answers(client=client)
            self.assertTrue(launcher.should_wrap({"TMUX": "/tmp/tmux-501/default,1,0"}, True, ask), client)

        ask, _ = self.answers(passthrough="all")
        self.assertTrue(launcher.should_wrap({"TMUX": "/tmp/tmux-501/default,1,0"}, True, ask))

    def test_leaves_everything_else_alone(self):
        # The pane's effective passthrough decides: a window set to off under a global on reads off here.
        tmux = {"TMUX": "/tmp/tmux-501/default,1,0"}
        cases = [
            ({}, True, self.answers()[0]),
            (tmux, False, self.answers()[0]),
            (tmux, True, self.answers(passthrough="off")[0]),
            (tmux, True, self.answers(passthrough="")[0]),
            (tmux, True, self.answers(client="iTerm2 3.5.4")[0]),
            (tmux, True, self.answers(client="WezTerm 20240203")[0]),
            (tmux, True, self.answers(client="")[0]),
        ]
        for env, interactive, ask in cases:
            self.assertFalse(launcher.should_wrap(env, interactive, ask))

    def test_without_a_client_type_only_a_refreshed_session_terminal_counts(self):
        # RMUX keeps no XTVERSION for its client. Its session TERM_PROGRAM names the attached terminal only when
        # update-environment copies it from every client that attaches; otherwise it is the one the session began in.
        rmux = {"TMUX": "/private/tmp/rmux-501/default,37545,0"}
        refreshed = "DISPLAY\nKRB5CCNAME\nSSH_ASKPASS\nTERM_PROGRAM"
        ask, _ = self.answers(client="", refreshed=refreshed, session="TERM_PROGRAM=SonicTerm")
        self.assertTrue(launcher.should_wrap(rmux, True, ask))
        ask, _ = self.answers(client="", refreshed="DISPLAY\nSSH_ASKPASS", session="TERM_PROGRAM=SonicTerm")
        self.assertFalse(launcher.should_wrap(rmux, True, ask))
        ask, _ = self.answers(client="", refreshed=refreshed, session="TERM_PROGRAM=iTerm.app")
        self.assertFalse(launcher.should_wrap(rmux, True, ask))
        ask, _ = self.answers(client="", refreshed=refreshed, session="-TERM_PROGRAM")
        self.assertFalse(launcher.should_wrap(rmux, True, ask))
        ask, _ = self.answers(client="iTerm2 3.5.4", refreshed=refreshed, session="TERM_PROGRAM=SonicTerm")
        self.assertFalse(launcher.should_wrap(rmux, True, ask))

    def test_asks_rmux_for_an_rmux_session(self):
        ask, asked = self.answers()
        self.assertTrue(launcher.should_wrap({"TMUX": "/private/tmp/rmux-501/default,37545,0"}, True, ask))
        self.assertEqual(set(asked), {"rmux"})
        ask, asked = self.answers()
        launcher.should_wrap({"TMUX": "/private/tmp/tmux-501/default,1,0"}, True, ask)
        self.assertEqual(set(asked), {"tmux"})

    def test_a_missing_multiplexer_answers_nothing(self):
        self.assertEqual(launcher.ask_multiplexer("mermaid-tty-no-such-multiplexer", ["show-options"]), "")


class SessionTests(unittest.TestCase):
    def relay(self, script, input_data=b""):
        # The session's own relay, over pipes, around a real child in a pty; signal handlers are put back after.
        saved = {number: signal.getsignal(number) for number in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT)}
        stdin_read, stdin_write = os.pipe()
        stdout_read, stdout_write = os.pipe()
        os.write(stdin_write, input_data)
        os.close(stdin_write)
        try:
            session = launcher.Session([sys.executable, "-c", script], stdin=stdin_read, stdout=stdout_write)
            session.relay()
            os.write(stdout_write, session.output.finish())
            os.close(stdout_write)
            while session.status is None:
                session.reap(block=True)

            with os.fdopen(stdout_read, "rb") as output:
                return session.status, output.read()
        finally:
            signal.set_wakeup_fd(-1)
            for number, handler in saved.items():
                signal.signal(number, handler)

    def test_output_held_when_the_child_exits_is_written(self):
        status, output = self.relay("import os; os.write(1, b'tail\\x1b_Gunfinished')")
        self.assertEqual(os.waitstatus_to_exitcode(status), 0)
        self.assertTrue(output.endswith(b"tail\x1b_Gunfinished"), output)

    def test_end_of_input_reaches_a_child_waiting_to_read(self):
        # Without the pty's EOF character the child would wait for input that can no longer come.
        status, output = self.relay("import sys; sys.stdin.read(); print('done')")
        self.assertEqual(os.waitstatus_to_exitcode(status), 0)
        self.assertIn(b"done", output)

    def test_a_kitty_command_from_the_child_comes_out_wrapped(self):
        _, output = self.relay("import os; os.write(1, b'\\x1b_Ga=T;QUJD\\x1b\\\\')")
        self.assertIn(launcher.passthrough(b"\x1b_Ga=T;QUJD\x1b\\"), output)


class ExitLikeTests(unittest.TestCase):
    def test_the_launcher_ends_as_claude_code_ended(self):
        driver = (
            "import importlib.util, sys; spec = importlib.util.spec_from_file_location('l', sys.argv[1]); "
            "module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); "
            "module.exit_like(int(sys.argv[2]))"
        )
        script = str(ROOT / "claude-tmux.py")
        exited_3 = 3 << 8
        killed_by_term = signal.SIGTERM
        self.assertEqual(subprocess.run([sys.executable, "-c", driver, script, str(exited_3)]).returncode, 3)
        self.assertEqual(
            subprocess.run([sys.executable, "-c", driver, script, str(killed_by_term)]).returncode, -signal.SIGTERM
        )


if __name__ == "__main__":
    unittest.main()
