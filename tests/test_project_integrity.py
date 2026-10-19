"""Repository documentation checks. Run with Python's standard unittest runner."""

import re
import subprocess
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
FENCE = re.compile(r"^\s*(`{3,}|~{3,})(.*)$")
LINK = re.compile(r"!?\[[^\]\n]*\]\(([^)\n]+)\)")


def markdown_body(text):
    """Exclude fenced examples so illustrative links aren't treated as files."""
    result = []
    opened = None
    for line in text.splitlines():
        match = FENCE.match(line)
        if match:
            marker, rest = match.groups()
            if opened is None:
                opened = marker
            elif marker[0] == opened[0] and len(marker) >= len(opened) and not rest.strip():
                opened = None
            continue
        if opened is None:
            result.append(line)
    if opened is not None:
        raise ValueError("Unclosed Markdown code fence")
    return "\n".join(result)


def missing_local_links(document, text):
    missing = []
    for match in LINK.finditer(markdown_body(text)):
        target = match.group(1).strip().strip("<>")
        url = urlsplit(target)
        if url.scheme or url.netloc or not url.path:
            continue
        path = (document.parent / unquote(url.path)).resolve()
        if not path.is_file():
            missing.append(target)
    return missing


class DocumentationIntegrityTests(unittest.TestCase):
    def test_repository_text_is_valid_utf8(self):
        files = [
            path for path in ROOT.rglob("*")
            if path.is_file() and ".git" not in path.relative_to(ROOT).parts
            and path.suffix in {".md", ".py", ".yaml"}
        ]
        self.assertTrue(files)
        for path in files:
            with self.subTest(path=path.relative_to(ROOT)):
                text = path.read_text(encoding="utf-8")
                self.assertNotIn("\ufffd", text)
                self.assertNotIn("\x00", text)

    def test_markdown_fences_and_local_links(self):
        documents = [
            path for path in ROOT.rglob("*.md")
            if ".git" not in path.relative_to(ROOT).parts
        ]
        self.assertTrue(documents)
        for path in documents:
            with self.subTest(path=path.relative_to(ROOT)):
                self.assertEqual(missing_local_links(path, path.read_text(encoding="utf-8")), [])

    def test_checker_detects_broken_relative_link(self):
        self.assertEqual(
            missing_local_links(ROOT / "example.md", "[missing](does-not-exist.md)"),
            ["does-not-exist.md"],
        )

    def test_checker_accepts_encoded_local_paths_and_external_links(self):
        text = "[design](%E7%BD%91%E9%A1%B5%E8%AE%BE%E8%AE%A1.md) [web](https://example.com/a)"
        self.assertEqual(missing_local_links(ROOT / "example.md", text), [])

    def test_checker_rejects_unclosed_fence(self):
        with self.assertRaises(ValueError):
            markdown_body("```text\nunclosed")
        self.assertEqual(markdown_body("~~~text\nexample\n~~~\nvisible"), "visible")

    def test_private_and_generated_paths_are_ignored(self):
        paths = [
            ".env", ".env.production", "private/customer-drawing.pdf",
            "uploads/drawing.dxf", "instance/app.db", "local.sqlite3",
            "backups/archive.zip", "server.key", "server.pem",
            "node_modules/package/index.js", "dist/index.html",
            "tests/__pycache__/test_project_integrity.cpython-313.pyc",
        ]
        result = subprocess.run(
            ["git", "check-ignore", "--no-index", "--stdin", "-z"],
            input=("\0".join(paths) + "\0").encode("utf-8"),
            capture_output=True, cwd=ROOT, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(set(result.stdout.decode("utf-8").rstrip("\0").split("\0")), set(paths))

    def test_source_and_skill_paths_are_not_ignored(self):
        paths = [
            "AGENTS.md", ".env.example", "site/index.html",
            ".agents/skills/project-handoff/SKILL.md",
            "tests/test_project_integrity.py",
        ]
        result = subprocess.run(
            ["git", "check-ignore", "--no-index", "--stdin", "-z"],
            input=("\0".join(paths) + "\0").encode("utf-8"),
            capture_output=True, cwd=ROOT, check=False,
        )
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(result.stdout, b"")


if __name__ == "__main__":
    unittest.main()
