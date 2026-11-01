#!/usr/bin/env python3
"""Run Claude Code so its kitty images show inside tmux or RMUX.

Inside a multiplexer, Claude Code writes its kitty graphics commands (`ESC _ G ... ESC \\`) bare, and tmux and RMUX
drop a bare APC: the picture's placeholder cells arrive, its pixels never do. This launcher runs `claude` in a pty
and rewrites each such command in Claude Code's own output as tmux passthrough (`ESC P tmux; ... ESC \\`, each inner
ESC doubled), which the multiplexer forwards to the terminal when `allow-passthrough` is on. It filters the one
output stream in order, so nothing races Claude Code's writes.

It wraps only when the pane can show the result: inside tmux or RMUX, the pane's effective `allow-passthrough` on,
stdin and stdout a terminal, and the terminal underneath kitty, Ghostty or SonicTerm. tmux 3.3 and later name that
terminal from the attached client's XTVERSION (`#{client_termtype}`). RMUX keeps none, so there it is the session's
TERM_PROGRAM, trusted only when `update-environment` refreshes it on every attach. Then it sets
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

ESC = b"\x1b"
STRING_END = b"\x1b\\"
# The final bytes that open a control string ending at ST: DCS P, SOS X, OSC ], PM ^, APC _.
STRING_OPENERS = b"PX]^_"
# A kitty command longer than this is passed through as it came: Claude Code sends 4 KiB chunks.
MAX_HELD_BYTES = 8 << 20
# The terminals that draw kitty images placed with Unicode placeholders, by XTVERSION reply or TERM_PROGRAM.
IMAGE_TERMINALS = re.compile(r"^(?:kitty|ghostty)\b|\bsonicterm\b", re.IGNORECASE)
QUERY_TIMEOUT_S = 2
# How long to keep reading the pty after Claude Code exits, for output a process it started still writes.
DRAIN_TIMEOUT_S = 0.2


def passthrough(command):
    """The tmux passthrough form of one complete escape sequence."""
    return b"\x1bPtmux;" + command.replace(ESC, ESC + ESC) + STRING_END


class PassthroughFilter:
    """Rewrites kitty graphics commands in a byte stream that arrives in arbitrary pieces.

    It tracks the escape structure so that only a kitty APC standing on its own is rewritten: bytes inside another
    control string (an OSC, a DCS such as an already-wrapped command, any other APC) pass untouched. A kitty command is
    wrapped when it ends within MAX_HELD_BYTES and passed through as it came otherwise, whatever the read boundaries.
    """

    def __init__(self):
        # "ground", "string" (inside a control string that is not a kitty command), "kitty" (holding one), or "raw"
        # (inside a kitty command too long to hold, streamed as it came, which ends as a string does).
        self.state = "ground"
        # Bytes that may begin a sequence or end a string, held until the next piece decides.
        self.pending = b""
        # The kitty command held so far.
        self.command = b""
        # The byte that opened the current control string; only an OSC (`]`) may end with BEL.
        self.opener = b""

    def feed(self, data):
        """The output for this piece; anything that may continue in the next piece is held back."""
        out = []
        data = self.pending + data
        self.pending = b""
        position = 0
        while position < len(data):
            if self.state == "ground":
                escape = data.find(ESC, position)
                if escape < 0:
                    out.append(data[position:])
                    break

                out.append(data[position:escape])
                if len(data) - escape < 3 and data[escape + 1 : escape + 2] in (b"", b"_"):
                    self.pending = data[escape:]
                    break

                opener = data[escape + 1 : escape + 2]
                if data[escape : escape + 3] == b"\x1b_G":
                    self.state = "kitty"
                    self.command = b""
                    position = escape
                elif opener and opener in STRING_OPENERS:
                    self.state = "string"
                    self.opener = opener
                    out.append(data[escape : escape + 2])
                    position = escape + 2
                else:
                    out.append(ESC)
                    position = escape + 1
            elif self.state == "kitty":
                position = self.hold_kitty(data, position, out)
            else:
                position = self.through_end(data, position, out)

        return b"".join(out)

    def through_end(self, data, position, out):
        """Pass a control string through to its end, ESC \\ or BEL for an OSC; return where reading continues.

        A doubled ESC is a literal one (tmux passthrough doubles them), so it never ends the string. Any other ESC
        aborts the string, as in a terminal's parser, and is read again as the start of a sequence."""
        while True:
            escape = data.find(ESC, position)
            bell = data.find(b"\x07", position) if self.opener == b"]" else -1
            if bell >= 0 and (escape < 0 or bell < escape):
                out.append(data[position : bell + 1])
                self.state = "ground"
                return bell + 1

            if escape < 0:
                out.append(data[position:])
                return len(data)

            if escape == len(data) - 1:
                out.append(data[position:escape])
                self.pending = ESC
                return len(data)

            follower = data[escape + 1 : escape + 2]
            if follower == ESC:
                out.append(data[position : escape + 2])
                position = escape + 2
                continue

            self.state = "ground"
            if follower == b"\\":
                out.append(data[position : escape + 2])
                return escape + 2

            out.append(data[position:escape])
            return escape

    def hold_kitty(self, data, position, out):
        """Hold a kitty command until its ST, then wrap it; past MAX_HELD_BYTES, release it unwrapped."""
        end = data.find(STRING_END, position)
        piece = data[position:] if end < 0 else data[position : end + len(STRING_END)]
        if end < 0 and piece.endswith(ESC):
            self.pending = ESC
            piece = piece[:-1]

        self.command += piece
        if end >= 0 and len(self.command) <= MAX_HELD_BYTES:
            out.append(passthrough(self.command))
            self.command = b""
            self.state = "ground"
            return end + len(STRING_END)

        if len(self.command) > MAX_HELD_BYTES:
            out.append(self.command)
            self.command = b""
            self.opener = b"_"
            self.state = "ground" if end >= 0 else "raw"

        return len(data) if end < 0 else end + len(STRING_END)

    def finish(self):
        """Everything still held, unchanged, for when the stream ends."""
        held = self.command + self.pending
        self.command = b""
        self.pending = b""
        self.state = "ground"
        return held


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
    if ask(command, ["display-message", "-p", "#{allow-passthrough}"]) not in ("on", "all"):
        return False

    return bool(IMAGE_TERMINALS.search(client_terminal(command, ask)))


def client_terminal(command, ask):
    """The terminal the multiplexer draws on: the attached client's XTVERSION reply. RMUX keeps none, so there it is the
    session's TERM_PROGRAM, when the session's own `update-environment` refreshes it from each client that attaches."""
    termtype = ask(command, ["display-message", "-p", "#{client_termtype}"])
    if termtype or command != "rmux":
        return termtype

    refreshed = ask(command, ["show-options", "-Av", "update-environment"]).split()
    if "TERM_PROGRAM" not in refreshed:
        return ""

    session = ask(command, ["show-environment", "TERM_PROGRAM"])
    return session.removeprefix("TERM_PROGRAM=") if session.startswith("TERM_PROGRAM=") else ""


def write_all(fd, data):
    """Write every byte, however many calls the descriptor takes."""
    view = memoryview(data)
    while view:
        try:
            written = os.write(fd, view)
        except InterruptedError:
            continue

        view = view[written:]


def copy_window_size(source, target):
    """Give the pty the terminal's size."""
    size = fcntl.ioctl(source, termios.TIOCGWINSZ, b"\0" * 8)
    fcntl.ioctl(target, termios.TIOCSWINSZ, size)


class Session:
    """Claude Code in a pty under this terminal: relays input, filtered output, size, signals and job control."""

    def __init__(self, argv, stdin=None, stdout=None):
        self.stdin = sys.stdin.fileno() if stdin is None else stdin
        self.stdout = sys.stdout.fileno() if stdout is None else stdout
        self.pid, self.master = pty.fork()
        if self.pid == 0:
            try:
                os.execvp(argv[0], argv)
            except OSError as error:
                os.write(2, f"claude-tmux: cannot run {argv[0]}: {error.strerror}\r\n".encode())
                os._exit(127)

        self.status = None
        self.output = PassthroughFilter()
        self.saved = None
        # Signals wake the relay through this pipe, since select is retried, not interrupted, after a handler runs.
        self.wake_read, wake_write = os.pipe()
        os.set_blocking(wake_write, False)
        signal.set_wakeup_fd(wake_write)
        signal.signal(signal.SIGCHLD, lambda *_: None)
        signal.signal(signal.SIGWINCH, lambda *_: self.resize())
        # The terminal is raw, so these come only from kill; Claude Code decides what they mean.
        for forwarded in (signal.SIGTERM, signal.SIGHUP, signal.SIGINT):
            signal.signal(forwarded, lambda number, _: self.forward(number))

    def resize(self):
        copy_window_size(self.stdin, self.master)

    def forward(self, number):
        try:
            os.kill(self.pid, number)
        except ProcessLookupError:
            pass

    def run(self):
        """Relay until Claude Code exits and its output is drained; return its wait status."""
        self.saved = termios.tcgetattr(self.stdin)
        self.resize()
        tty.setraw(self.stdin)
        try:
            self.relay()
            write_all(self.stdout, self.output.finish())
        finally:
            termios.tcsetattr(self.stdin, termios.TCSAFLUSH, self.saved)

        while self.status is None:
            self.reap(block=True)

        return self.status

    def relay(self):
        watched = [self.master, self.wake_read, self.stdin]
        while True:
            timeout = DRAIN_TIMEOUT_S if self.status is not None else None
            ready, _, _ = select.select(watched, [], [], timeout)
            if not ready:
                return

            if self.wake_read in ready:
                os.read(self.wake_read, 512)
                self.reap(block=False)

            if self.stdin in ready:
                data = os.read(self.stdin, 65536)
                if data:
                    write_all(self.master, data)
                else:
                    # The terminal went away: hang up on Claude Code as the terminal would, then drain its output.
                    watched.remove(self.stdin)
                    self.forward(signal.SIGHUP)

            if self.master in ready:
                try:
                    data = os.read(self.master, 65536)
                except OSError:
                    return

                if not data:
                    return

                write_all(self.stdout, self.output.feed(data))

    def reap(self, block):
        """Record Claude Code's exit, or follow it into a stop: hand the terminal back, stop this launcher too, and on
        `fg` take the terminal again and continue it."""
        try:
            pid, status = os.waitpid(self.pid, (0 if block else os.WNOHANG) | os.WUNTRACED)
        except ChildProcessError:
            return

        if pid == 0:
            return

        if not os.WIFSTOPPED(status):
            self.status = status
            return

        # A kitty command half read stays held, so the rest that comes after fg still ends it and it is wrapped.
        if self.saved is not None:
            termios.tcsetattr(self.stdin, termios.TCSAFLUSH, self.saved)

        os.kill(os.getpid(), signal.SIGTSTP)
        if self.saved is not None:
            tty.setraw(self.stdin)
            self.resize()

        os.kill(self.pid, signal.SIGCONT)


def exit_like(status):
    """End this process as Claude Code ended: the same exit code, or the same signal."""
    if os.WIFSIGNALED(status):
        number = os.WTERMSIG(status)
        signal.signal(number, signal.SIG_DFL)
        os.kill(os.getpid(), number)

    sys.exit(os.waitstatus_to_exitcode(status))


def main(arguments):
    claude = os.environ.get("MERMAID_TTY_CLAUDE", "claude")
    argv = [claude, *arguments]
    interactive = sys.stdin.isatty() and sys.stdout.isatty()
    if not should_wrap(os.environ, interactive):
        os.execvp(claude, argv)

    os.environ["CLAUDE_CODE_FORCE_TERMINAL_IMAGES"] = "1"
    os.environ["MERMAID_TTY_TMUX_IMAGES"] = "1"
    exit_like(Session(argv).run())


if __name__ == "__main__":
    main(sys.argv[1:])
