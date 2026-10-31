#!/usr/bin/env python3
"""Check the Python scripts against the house style; print `file:line rule` lines.

Called by check-style.ts with the files to check. Python's own tokenizer tells
code from strings and comments, so a `;` or `#` inside a string is never read
as code or a citation.
"""
import io
import re
import sys
import tokenize

MAX_COLUMNS = 120
MAX_LINES = 1000

# A hash and a number that is not part of a word, a color or an HTML entity; "issue", "PR" or "pull request" with a
# number; or a link to an issue or pull request page. The same patterns as check-style.ts.
CITATIONS = [
    re.compile(r"(?<![\w&/#-])#\d{1,5}\b(?!;)(?![0-9a-fA-F])"),
    re.compile(r"\b(?:issues?|PRs?|pull requests?)[ \t]*(?:#|no\.|number)?[ \t]*\d+\b", re.IGNORECASE),
    re.compile(r"/(?:issues|pulls?)/\d+\b"),
]
COLOR = re.compile(r"#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b")

# Statement keywords that open a block with a colon; a body on the same line is a compound statement (E701).
BLOCK_OPENERS = {"if", "elif", "else", "for", "while", "try", "except", "finally", "with", "def", "class", "case"}


def cites_issue(text):
    text = COLOR.sub("", text)
    return any(pattern.search(text) for pattern in CITATIONS)


def check(path, source, cite_exempt):
    found = []
    lines = source.split("\n")
    if lines and lines[-1] == "":
        lines.pop()

    if len(lines) > MAX_LINES:
        found.append((MAX_LINES + 1, "max-lines"))

    tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
    in_string = set()
    for token in tokens:
        if token.type == tokenize.STRING or token.type in getattr(tokenize, "FSTRING_TYPES", ()):
            for row in range(token.start[0], token.end[0] + 1):
                in_string.add(row)

        if token.type == tokenize.COMMENT and not cite_exempt and cites_issue(token.string):
            found.append((token.start[0], "issue-number"))

        if token.type == tokenize.OP and token.string == ";":
            found.append((token.start[0], "one-statement-per-line"))

    # A block opener whose colon ends a logical line that still holds code after it: `if x: y`.
    logical = []
    for token in tokens:
        if token.type in (tokenize.NEWLINE, tokenize.ENDMARKER):
            check_compound(logical, found)
            logical = []
        elif token.type not in (tokenize.NL, tokenize.COMMENT, tokenize.INDENT, tokenize.DEDENT):
            logical.append(token)

    for number, text in enumerate(lines, start=1):
        if len(text) > MAX_COLUMNS and number not in in_string and "://" not in text:
            found.append((number, "max-len"))

    return [f"{path}:{line} {rule}" for line, rule in sorted(found)]


def check_compound(logical, found):
    if not logical or logical[0].type != tokenize.NAME or logical[0].string not in BLOCK_OPENERS:
        return

    depth = 0
    for i, token in enumerate(logical):
        if token.string in ("(", "[", "{"):
            depth += 1
        elif token.string in (")", "]", "}"):
            depth -= 1
        elif token.string == ":" and depth == 0 and token.type == tokenize.OP:
            if i + 1 < len(logical):
                found.append((token.start[0], "one-statement-per-line"))

            return


def main(argv):
    cite_exempt = {path for path in argv if path.endswith("_tests.py")}
    problems = []
    for path in argv:
        with open(path, encoding="utf-8") as handle:
            problems.extend(check(path, handle.read(), path in cite_exempt))

    for problem in problems:
        print(problem)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
