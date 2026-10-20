"""Verify the project-local skill payload and exercise its bundled CLI tools."""

import hashlib
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / ".agents" / "skills" / "refactoring-ui"


def run_tool(name, *args):
    return subprocess.run(
        [sys.executable, "-X", "utf8", str(SKILL / "scripts" / name), *args],
        capture_output=True, text=True, encoding="utf-8", cwd=ROOT, timeout=20,
    )


class RefactoringUISkillTests(unittest.TestCase):
    def test_installed_payload_matches_pinned_upstream_and_recorded_patch(self):
        record = json.loads((SKILL / "upstream.json").read_text(encoding="utf-8"))
        self.assertEqual(record["repository"], "https://github.com/edisonmbli/refactoring-ui-skill")
        self.assertRegex(record["commit"], r"^[0-9a-f]{40}$")
        files = record["files"]
        expected = {entry["path"] for entry in files}
        self.assertEqual(len(expected), len(files), "Source records cannot duplicate paths")
        actual = {
            path.relative_to(SKILL).as_posix() for path in SKILL.rglob("*")
            if path.is_file() and "__pycache__" not in path.parts and path.name != "upstream.json"
        }
        self.assertEqual(actual, expected)
        patched = set()
        for entry in files:
            with self.subTest(path=entry["path"]):
                path = (SKILL / entry["path"]).resolve()
                self.assertTrue(path.is_relative_to(SKILL.resolve()))
                self.assertRegex(entry["upstream_sha256"], r"^[0-9a-f]{64}$")
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), entry["installed_sha256"])
                if entry["installed_sha256"] != entry["upstream_sha256"]:
                    patched.add(entry["path"])
        self.assertEqual(patched, {item["path"] for item in record["local_changes"]})
        self.assertEqual(patched, {"SKILL.md", "references/11-design-tokens.md"})
        self.assertTrue({"LICENSE", "ATTRIBUTION.md"}.issubset(expected))

    def test_project_entry_and_reference_index_resolve(self):
        entry = ".agents/skills/refactoring-ui/SKILL.md"
        self.assertIn(f"]({entry})", (ROOT / "AGENTS.md").read_text(encoding="utf-8"))
        skill_text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        references = set(re.findall(r"`(\d{2}-[a-z-]+\.md)`", skill_text))
        self.assertTrue(references)
        self.assertEqual(references, {path.name for path in (SKILL / "references").glob("*.md")})
        for name in references:
            self.assertTrue((SKILL / "references" / name).is_file(), name)

    def test_palette_cli_preserves_base_and_produces_ordered_color_ramp(self):
        result = run_tool("generate_palette.py", "--base", "#cdb478", "--name", "primary", "--json")
        self.assertEqual(result.returncode, 0, result.stderr)
        ramp = json.loads(result.stdout)["primary"]
        self.assertEqual(set(ramp), {str(stop) for stop in range(100, 1000, 100)})
        self.assertEqual(ramp["500"]["hex"], "#cdb478")
        levels = [ramp[str(stop)]["l"] for stop in range(100, 1000, 100)]
        self.assertEqual(levels, sorted(levels, reverse=True))
        for color in ramp.values():
            self.assertRegex(color["hex"], r"^#[0-9a-f]{6}$")

    def test_contrast_cli_accepts_readable_and_rejects_unreadable_pairs(self):
        for foreground, background, code, verdict in [
            ("#000000", "#ffffff", 0, "21.00:1"),
            ("#ffffff", "#ffffff", 1, "FAIL"),
        ]:
            with self.subTest(foreground=foreground, background=background):
                result = run_tool("check_contrast.py", "--pair", foreground, background)
                self.assertEqual(result.returncode, code, result.stderr)
                self.assertIn(verdict, result.stdout)

    def test_token_cli_resolves_template_and_emits_all_supported_formats(self):
        template = SKILL / "assets" / "tokens.template.json"
        tokens = json.loads(template.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as directory:
            result = run_tool("emit_tokens.py", str(template), "--format", "all", "--out", directory)
            self.assertEqual(result.returncode, 0, result.stderr)
            output = Path(directory)
            self.assertEqual(
                {path.name for path in output.iterdir()},
                {"tokens.css", "theme.css", "tailwind.config.js", "preview.html"},
            )
            css = (output / "tokens.css").read_text(encoding="utf-8")
            action = tokens["primitive"]["color"]["primary"]["500"]
            self.assertIn(f"--color-action: {action};", css)
            self.assertNotIn("{color.", css)
            self.assertIn("@theme {", (output / "theme.css").read_text(encoding="utf-8"))
            self.assertIn("module.exports", (output / "tailwind.config.js").read_text(encoding="utf-8"))
            self.assertIn("<!doctype html>", (output / "preview.html").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
