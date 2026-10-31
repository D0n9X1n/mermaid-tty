#!/usr/bin/env python3
"""Tests for the tmux launcher: the passthrough rewrite and when it applies."""
import importlib.util
from pathlib import Path
import sys
import unittest

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
    return b"".join(output.feed(data[start : start + size]) for start in range(0, len(data), size))


class PassthroughFilterTests(unittest.TestCase):
    def test_a_kitty_command_is_wrapped_and_its_escapes_doubled(self):
        self.assertEqual(launcher.PassthroughFilter().feed(b"a" + TRANSMIT + b"b"), b"a" + WRAPPED + b"b")

    def test_every_split_point_gives_the_same_output(self):
        # A pty read can end anywhere: inside ESC _ G, inside the payload, between ESC and backslash of its end.
        stream = b"\x1b[1mbold\x1b[0m" + TRANSMIT + b"\x1b_Gm=0,q=2;REVG\x1b\\\x1b[38;5;7m\xf4\x8e\xbb\xae\x1b[39m"
        whole = launcher.PassthroughFilter().feed(stream)
        for size in range(1, len(stream) + 1):
            self.assertEqual(feed_in_pieces(stream, size), whole, f"pieces of {size}")

        self.assertEqual(whole.count(b"\x1bPtmux;"), 2)
        self.assertNotIn(b"\x1b_G", whole.replace(b"\x1b\x1b_G", b""))

    def test_other_escape_sequences_pass_untouched_and_without_delay(self):
        # A lone ESC or ESC _ is held only because it may begin a kitty command; any other ESC goes out at once.
        output = launcher.PassthroughFilter()
        self.assertEqual(output.feed(b"\x1b]0;title\x07\x1b_Xother\x1b\\\x1b[2J"), b"\x1b]0;title\x07\x1b_Xother\x1b\\\x1b[2J")
        self.assertEqual(output.feed(b"tail\x1b"), b"tail")
        self.assertEqual(output.feed(b"[0m"), b"\x1b[0m")

    def test_a_command_longer_than_the_limit_is_passed_through_as_it_came(self):
        output = launcher.PassthroughFilter()
        payload = b"\x1b_Gm=1;" + b"A" * (launcher.MAX_HELD_BYTES + 1)
        self.assertEqual(output.feed(payload), payload)
        self.assertEqual(output.feed(b"\x1b\\after"), b"\x1b\\after")


class ShouldWrapTests(unittest.TestCase):
    def answers(self, passthrough="on", client="kitty SonicTerm 1.4.0", started=""):
        asked = []

        def ask(command, arguments):
            asked.append(command)
            if arguments[0] == "show-options":
                return passthrough

            if arguments[0] == "show-environment":
                return started

            return client

        return ask, asked

    def test_wraps_in_tmux_with_passthrough_for_an_image_terminal(self):
        for client in ("kitty SonicTerm 1.4.0", "kitty(0.42.1)", "ghostty 1.3.1", "Ghostty 1.2.0"):
            ask, _ = self.answers(client=client)
            self.assertTrue(launcher.should_wrap({"TMUX": "/tmp/tmux-501/default,1,0"}, True, ask), client)

        ask, _ = self.answers(passthrough="all")
        self.assertTrue(launcher.should_wrap({"TMUX": "/tmp/tmux-501/default,1,0"}, True, ask))

    def test_leaves_everything_else_alone(self):
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

    def test_asks_rmux_for_an_rmux_session(self):
        ask, asked = self.answers()
        self.assertTrue(launcher.should_wrap({"TMUX": "/private/tmp/rmux-501/default,37545,0"}, True, ask))
        self.assertEqual(set(asked), {"rmux"})
        ask, asked = self.answers()
        launcher.should_wrap({"TMUX": "/private/tmp/tmux-501/default,1,0"}, True, ask)
        self.assertEqual(set(asked), {"tmux"})

    def test_without_a_client_type_the_servers_terminal_decides(self):
        # RMUX keeps no XTVERSION for its client; the TERM_PROGRAM its server started with names the terminal.
        rmux = {"TMUX": "/private/tmp/rmux-501/default,37545,0"}
        ask, _ = self.answers(client="", started="TERM_PROGRAM=SonicTerm")
        self.assertTrue(launcher.should_wrap(rmux, True, ask))
        ask, _ = self.answers(client="", started="TERM_PROGRAM=iTerm.app")
        self.assertFalse(launcher.should_wrap(rmux, True, ask))
        ask, _ = self.answers(client="", started="-TERM_PROGRAM")
        self.assertFalse(launcher.should_wrap(rmux, True, ask))
        # A client type, when the multiplexer has one, wins over how the server started.
        ask, _ = self.answers(client="iTerm2 3.5.4", started="TERM_PROGRAM=SonicTerm")
        self.assertFalse(launcher.should_wrap(rmux, True, ask))

    def test_a_missing_multiplexer_answers_nothing(self):
        self.assertEqual(launcher.ask_multiplexer("mermaid-tty-no-such-multiplexer", ["show-options"]), "")


if __name__ == "__main__":
    unittest.main()
