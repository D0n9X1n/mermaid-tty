#!/usr/bin/env python3
"""Render a release's notes from the issues and pull requests it ships, after validating its history."""
import argparse
import html
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import unicodedata

# The hyphenated filename is not a valid module name, so the sibling script is loaded from its path.
SPEC = importlib.util.spec_from_file_location("release_issues", Path(__file__).with_name("release-issues.py"))
issues = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = issues
SPEC.loader.exec_module(issues)

NUMERIC = r"(?:0|[1-9][0-9]*)"
TAG = re.compile(rf"v{NUMERIC}\.{NUMERIC}\.{NUMERIC}")
RELEASE_PR = re.compile(rf"mermaid-tty {TAG.pattern}")

# The install block check-release.ts requires in every release's notes (scripts/lib/workflow.ts, INSTALL).
INSTALL = ("claude plugin marketplace add D0n9X1n/mermaid-tty\n"
           "claude plugin install mermaid-tty@mermaid-tty --config theme=default")


def markdown_line(value):
    """Untrusted titles cannot add HTML, Markdown, or controls."""
    value = "".join(" " if unicodedata.category(character).startswith("C") else character
                    for character in value)
    value = " ".join(value.split())
    return re.sub(r"([\\`*_{}\[\]()#+.!|~-])", r"\\\1", html.escape(value, quote=False))


def render(tag, *, api=None, cwd=None, environ=None):
    environ = os.environ if environ is None else environ
    cwd = Path.cwd() if cwd is None else Path(cwd)
    issues.require(TAG.fullmatch(tag) is not None, "release tag must be a v-prefixed SemVer such as v1.2.3")
    repo = issues.repository(environ.get("GITHUB_REPOSITORY", "D0n9X1n/mermaid-tty"))
    api = api or issues.Api()

    def git(*args, allow_failure=False):
        code, output, _ = issues.capture(["git", *args], min(15, api.remaining()),
                                        api.limits.max_output, cwd)
        issues.require(code == 0 or allow_failure, f"Git release validation failed: {args[0]}")
        return output.strip() if code == 0 else None

    issues.require(git("rev-parse", "--is-shallow-repository") == "false",
                   "release notes require complete history; shallow repositories are not supported")

    # Fully qualify the ref: a similarly named branch is not a release tag.
    head = issues.oid(git("rev-parse", "--verify", "--end-of-options", f"refs/tags/{tag}^{{commit}}"))
    previous = environ.get("PREVIOUS_TAG", "")
    if not previous:
        # Describing the parent finds the previous release, not the tag being released. Only v* tags
        # are releases: claude plugin tag makes tags such as mermaid-tty--v1.0.0.
        previous = git("describe", "--tags", "--abbrev=0", "--match", "v*", f"{head}^", allow_failure=True)
    issues.require(previous and TAG.fullmatch(previous), "release predecessor lookup failed; fetch complete "
                   "tags or set PREVIOUS_TAG to the previous v-prefixed release tag")
    base = git("rev-parse", "--verify", "--end-of-options", f"refs/tags/{previous}^{{commit}}", allow_failure=True)
    issues.require(base, f"release predecessor {previous} is not a tag")

    plugin = json.loads(git("show", f"{head}:.claude-plugin/plugin.json"))
    issues.require(isinstance(plugin, dict) and plugin.get("name") == "mermaid-tty",
                   "tagged plugin name must be mermaid-tty")
    version = tag[1:]
    issues.require(plugin.get("version") == version, "release tag does not match the tagged plugin.json version")

    shipped = {}
    resolved = issues.collect(repo, head, issues.oid(base), api=api, cwd=cwd, shipped=shipped)
    # A release PR, titled like "mermaid-tty v1.1.1", bumps the version; the issues it closes are listed above.
    pulls = [f"- [#{n}](https://github.com/{repo}/pull/{n}) — {markdown_line(title)}"
             for n, title in sorted(shipped.items()) if not RELEASE_PR.fullmatch(title.strip())]
    return (
        f"# mermaid-tty {tag}\n\n"
        "## Install\n\n"
        f"```sh\n{INSTALL}\n```\n\n"
        "Needs Claude Code 2.1.287 or later. Already installed? "
        "Run `claude plugin update mermaid-tty@mermaid-tty`.\n\n"
        f"{resolved}\n"
        "## Pull requests\n\n"
        + ("\n".join(pulls) if pulls else "No pull requests merged in this release range.")
        + "\n"
    )


def main(argv=None, *, api=None, cwd=None, environ=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag", help="existing release tag, e.g. v1.1.2")
    args = parser.parse_args(argv)

    try:
        notes = render(args.tag, api=api, cwd=cwd, environ=environ)
    except (issues.Failure, OSError, KeyError, TypeError, ValueError,
            TimeoutError, RecursionError) as error:
        print(f"release notes failed: {error}", file=sys.stderr)
        return 1

    print(notes, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
