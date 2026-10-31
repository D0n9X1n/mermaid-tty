#!/usr/bin/env python3
"""Offline renderer tests: real temporary Git histories and fake gh metadata."""
import importlib.util
import json
import os
from pathlib import Path
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


helpers = load("release_issue_fixtures", ROOT / "release-issues_tests.py")

# Execute the actual CLI main in a fresh interpreter, injecting only the gh transport.
DRIVER = '''import importlib.util, sys
spec = importlib.util.spec_from_file_location("release_notes", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
api = module.issues.Api(command=[sys.executable, sys.argv[2]],
                        limits=module.issues.Limits(retry_delay=0))
sys.exit(module.main(sys.argv[3:], api=api))
'''

INSTALL = ("claude plugin marketplace add D0n9X1n/mermaid-tty\n"
           "claude plugin install mermaid-tty@mermaid-tty --config theme=default")


class ReleaseNotesTests(unittest.TestCase):
    def setUp(self):
        clean_env = patch.dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
        clean_env.start()
        self.addCleanup(clean_env.stop)
        self.history = helpers.ProvenanceTests()
        self.history.setUp()
        self.addCleanup(self.history.doCleanups)
        self.path = self.history.path
        self.git = self.history.git
        self.commit = self.history.commit
        self.write_plugin("1.1.1")
        self.base = self.commit("mermaid-tty v1.1.1")
        self.git("tag", "v1.1.1")
        self.write_plugin("1.1.2")
        self.feature = self.commit("Draw more (Fixes #7)")
        self.untagged = self.commit("mermaid-tty v1.1.1.1 never tagged")
        self.bump = self.commit("mermaid-tty v1.1.2")
        self.git("tag", "v1.1.2")
        self.history.association(self.feature, [12])
        self.history.association(self.bump, [13])
        self.history.association(self.untagged, [11])
        self.history.pr(11, self.untagged, [], title="mermaid-tty v1.0.9")
        self.history.pr(12, self.feature, [7], title="Draw more <things>")
        self.history.pr(13, self.bump, [], title="mermaid-tty v1.1.2")
        self.history.issue(7, [helpers.pr_closer(12, self.feature)], title="Draw ~T~ generics")
        self.driver = self.path / "run_notes.py"
        self.driver.write_text(DRIVER, encoding="utf-8")

    def write_plugin(self, version, name="mermaid-tty"):
        folder = self.path / ".claude-plugin"
        folder.mkdir(exist_ok=True)
        (folder / "plugin.json").write_text(json.dumps({"name": name, "version": version}))
        self.git("add", ".claude-plugin/plugin.json")

    def cli(self, *args, env=None):
        self.history.fixture_path.write_text(json.dumps(self.history.fixture))
        environment = dict(os.environ, GITHUB_REPOSITORY="owner/repo", PYTHONIOENCODING="utf-8")
        for key in ("PREVIOUS_TAG", "RELEASE_FIRST"):
            environment.pop(key, None)
        environment.update(env or {})
        return subprocess.run([sys.executable, str(self.driver), str(ROOT / "release-notes.py"),
                               str(self.history.fake), *(args or ["v1.1.2"])],
                              cwd=self.path, env=environment, capture_output=True,
                              text=True, encoding="utf-8", timeout=30)

    def success(self, *args, **kwargs):
        result = self.cli(*args, **kwargs)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        return result.stdout

    def failure(self, pattern, *args, **kwargs):
        result = self.cli(*args, **kwargs)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "", "a failure must not emit partial release notes")
        self.assertRegex(result.stderr, pattern)

    def test_title_install_issues_and_pull_requests_without_a_commit_log(self):
        notes = self.success()
        self.assertTrue(notes.startswith("# mermaid-tty v1.1.2\n\n## Install\n\n```sh\n" + INSTALL + "\n```\n"))
        self.assertIn("Already installed? Run `claude plugin update mermaid-tty@mermaid-tty`.", notes)
        self.assertIn("## Resolved issues\n\n- [#7](https://github.com/owner/repo/issues/7) — Draw \\~T\\~ generics\n", notes)
        self.assertIn("## Pull requests\n\n- [#12](https://github.com/owner/repo/pull/12) — Draw more &lt;things&gt;\n", notes)
        self.assertNotIn("#13", notes, "a release PR only bumps the version")
        self.assertNotIn("#11", notes, "an untagged release PR is still a release PR")
        self.assertNotIn(self.feature[:7], notes, "no commit log")
        self.assertNotIn("Changes since", notes)

    def test_predecessor_is_the_previous_v_tag_and_can_be_given(self):
        self.git("tag", "mermaid-tty--v1.1.2", self.feature)
        self.assertIn("[#12]", self.success())
        self.assertIn("[#12]", self.success(env={"PREVIOUS_TAG": "v1.1.1"}))
        self.failure("predecessor", env={"PREVIOUS_TAG": "v9.9.9"})

    def test_no_pull_requests_says_so(self):
        self.history.pr(12, self.feature, [7], merged=False)
        self.assertIn("## Pull requests\n\nNo pull requests merged in this release range.\n", self.success())

    def test_tag_must_match_the_tagged_plugin_version(self):
        self.git("tag", "-d", "v1.1.2")
        self.git("tag", "v1.1.3")
        self.failure("plugin.json version", "v1.1.3")
        self.failure("v-prefixed SemVer", "1.1.2")

    def test_tagged_plugin_must_be_mermaid_tty(self):
        self.git("tag", "-d", "v1.1.2")
        self.write_plugin("1.1.2", name="other-plugin")
        self.commit("rename")
        self.git("tag", "v1.1.2")
        self.failure("plugin name")

    def test_shallow_history_is_rejected(self):
        clone = self.path / "shallow"
        subprocess.run(["git", "clone", "-q", "--depth", "1", "--no-local", f"file://{self.path}", str(clone)],
                       check=True)
        result = subprocess.run([sys.executable, str(self.driver), str(ROOT / "release-notes.py"),
                                 str(self.history.fake), "v1.1.2"], cwd=clone, capture_output=True, text=True,
                                env=dict(os.environ, GITHUB_REPOSITORY="owner/repo"), timeout=30)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertRegex(result.stderr, "shallow")

    def test_metadata_failure_never_emits_partial_notes(self):
        self.history.fixture[f"repos/owner/repo/commits/{self.feature}/pulls?per_page=100&page=1"] = {
            "status": 401, "body": {"message": "Bad credentials"}}
        self.failure("release notes failed")


if __name__ == "__main__":
    unittest.main()
