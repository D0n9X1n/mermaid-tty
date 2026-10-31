#!/usr/bin/env python3
"""Run Claude Code so its kitty images show inside tmux or RMUX.

Inside a multiplexer, Claude Code writes its kitty graphics commands (`ESC _ G ... ESC \\`) bare, and tmux and RMUX
drop a bare APC: the picture's placeholder cells arrive, its pixels never do. This launcher runs `claude` in a pty
and rewrites each such command in Claude Code's own output as tmux passthrough (`ESC P tmux; ... ESC \\`, each inner
ESC doubled), which the multiplexer forwards to the terminal when `allow-passthrough` is on. It filters the one
output stream in order, so nothing races Claude Code's writes.

It wraps only when the pane can show the result: inside tmux or RMUX, `allow-passthrough` on, stdin and stdout a
terminal, and the attached client's XTVERSION (`#{client_termtype}`), or for RMUX, which keeps none, the server's
TERM_PROGRAM, naming kitty, Ghostty or SonicTerm. Then it sets
CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1, so Claude Code lays the picture out, and MERMAID_TTY_TMUX_IMAGES=1, so
mermaid-tty draws one. Anywhere else it runs `claude` unchanged. MERMAID_TTY_CLAUDE names another claude to run.

Usage: python3 claude-tmux.py [claude arguments...]
"""
import fcntl
import os
import pty
import re
import select
import signal
import subprocess
import sys
import termios
import tty

APC_START = b"\x1b_G"
STRING_END = b"\x1b\\"
# A kitty command longer than this is passed through as it came rather than held: Claude Code sends 4 KiB chunks.
MAX_HELD_BYTES = 8 << 20
# The client terminals that draw kitty images placed with Unicode placeholders, by their XTVERSION reply.
IMAGE_TERMINALS = re.compile(r"^(?:kitty|ghostty)\b|\bsonicterm\b", re.IGNORECASE)
QUERY_TIMEOUT_S = 2


def passthrough(command):
    """The tmux passthrough form of one complete escape sequence."""
    return b"\x1bPtmux;" + command.replace(b"\x1b", b"\x1b\x1b") + STRING_END


class PassthroughFilter:
    """Rewrites kitty graphics commands in a byte stream that arrives in arbitrary pieces."""

    def __init__(self):
        # Bytes that may begin a kitty command, held until the next piece decides.
        self.pending = b""
        # The kitty command read so far, or None outside one.
        self.command = None

    def feed(self, data):
        """The output for this piece; anything that may continue in the next piece is held back."""
        out = []
        data = self.pending + data
        self.pending = b""
        while data:
            if self.command is None:
                start = data.find(APC_START)
                if start < 0:
                    held = next((size for size in (2, 1) if data.endswith(APC_START[:size])), 0)
                    out.append(data[: len(data) - held])
                    self.pending = data[len(data) - held :]
                    break

                out.append(data[:start])
                self.command = b""
                data = data[start:]

            # The end can straddle two pieces (ESC in one, backslash in the next), so the search starts one byte back
            # into what is already held; only that byte is searched again.
            searched_from = max(len(self.command) - 1, 0)
            command = self.command + data
            end = command.find(STRING_END, searched_from)
            if end < 0:
                self.command = command
                if len(self.command) > MAX_HELD_BYTES:
                    out.append(self.command)
                    self.command = None

                break

            out.append(passthrough(command[: end + len(STRING_END)]))
            self.command = None
            data = command[end + len(STRING_END) :]

        return b"".join(out)


def multiplexer(env):
    """The command that answers for the session in $TMUX: rmux for an RMUX socket, else tmux."""
    socket = env.get("TMUX", "").split(",")[0]
    if "rmux" in os.path.basename(os.path.dirname(socket)):
        return "rmux"

    return "tmux"


def ask_multiplexer(command, arguments):
    """The multiplexer's answer, stripped, or an empty string when it fails or is missing."""
    try:
        result = subprocess.run(
            [command, *arguments], capture_output=True, text=True, timeout=QUERY_TIMEOUT_S, check=False
        )
    except (OSError, subprocess.SubprocessError):
        return ""

    return result.stdout.strip() if result.returncode == 0 else ""


def should_wrap(env, interactive, ask=ask_multiplexer):
    """Whether this session is inside a multiplexer that will forward wrapped kitty images to a terminal that draws
    them. `ask(command, arguments)` returns the multiplexer's answer."""
    if not env.get("TMUX") or not interactive:
        return False

    command = multiplexer(env)
    if ask(command, ["show-options", "-gv", "allow-passthrough"]) not in ("on", "all"):
        return False

    return bool(IMAGE_TERMINALS.search(client_terminal(command, ask)))


def client_terminal(command, ask):
    """The terminal the multiplexer draws on: the attached client's XTVERSION reply (tmux 3.3 and later), or, where the
    multiplexer keeps none (RMUX), the TERM_PROGRAM its server started with, which a client attached later from another
    terminal leaves unchanged."""
    termtype = ask(command, ["display-message", "-p", "#{client_termtype}"])
    if termtype:
        return termtype

    started = ask(command, ["show-environment", "-g", "TERM_PROGRAM"])
    return started.removeprefix("TERM_PROGRAM=") if started.startswith("TERM_PROGRAM=") else ""


def copy_window_size(source, target):
    """Give the pty the terminal's size."""
    size = fcntl.ioctl(source, termios.TIOCGWINSZ, b"\0" * 8)
    fcntl.ioctl(target, termios.TIOCSWINSZ, size)


def run_wrapped(argv):
    """Run argv in a pty, relaying input and filtered output, and return its exit code."""
    pid, master = pty.fork()
    if pid == 0:
        os.execvp(argv[0], argv)

    copy_window_size(sys.stdin.fileno(), master)
    signal.signal(signal.SIGWINCH, lambda *_: copy_window_size(sys.stdin.fileno(), master))
    saved = termios.tcgetattr(sys.stdin.fileno())
    tty.setraw(sys.stdin.fileno())
    output = PassthroughFilter()
    try:
        relay(master, output)
    finally:
        termios.tcsetattr(sys.stdin.fileno(), termios.TCSAFLUSH, saved)

    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status)


def relay(master, output):
    """Copy the terminal's input to the pty and the pty's output, filtered, to the terminal until the pty closes."""
    stdin = sys.stdin.fileno()
    stdout = sys.stdout.fileno()
    while True:
        try:
            ready, _, _ = select.select([stdin, master], [], [])
        except InterruptedError:
            continue

        if stdin in ready:
            data = os.read(stdin, 65536)
            if not data:
                break

            os.write(master, data)

        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError:
                break

            if not data:
                break

            os.write(stdout, output.feed(data))


def main(arguments):
    claude = os.environ.get("MERMAID_TTY_CLAUDE", "claude")
    argv = [claude, *arguments]
    interactive = sys.stdin.isatty() and sys.stdout.isatty()
    if not should_wrap(os.environ, interactive):
        os.execvp(claude, argv)

    os.environ["CLAUDE_CODE_FORCE_TERMINAL_IMAGES"] = "1"
    os.environ["MERMAID_TTY_TMUX_IMAGES"] = "1"
    return run_wrapped(argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
