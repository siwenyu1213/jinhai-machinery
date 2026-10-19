"""Repository documentation checks. Run with Python's standard unittest runner."""

import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit
from unittest import mock


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
        if not path.is_relative_to(ROOT) or not path.is_file():
            missing.append(target)
    return missing


def table_width_errors(text):
    """Report inconsistent columns in pipe-delimited documentation tables."""
    errors = []
    expected = None
    for number, line in enumerate(markdown_body(text).splitlines(), start=1):
        line = line.strip()
        if not line.startswith("|"):
            expected = None
            continue
        columns = len(re.split(r"(?<!\\)\|", line.strip("|")))
        if expected is None:
            expected = columns
        elif columns != expected:
            errors.append((number, expected, columns))
    return errors


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

    def test_document_tables_have_consistent_columns(self):
        for path in ROOT.rglob("*.md"):
            if ".git" not in path.relative_to(ROOT).parts:
                with self.subTest(path=path.relative_to(ROOT)):
                    self.assertEqual(table_width_errors(path.read_text(encoding="utf-8")), [])

    def test_machine_detail_counts_reconcile_with_inventory_total(self):
        text = (ROOT / "网页设计.md").read_text(encoding="utf-8")
        summary = re.search(r"^\| 机床合计 \| (\d+) 台 \|", text, re.MULTILINE)
        self.assertIsNotNone(summary, "Inventory must state its machine total")
        detail = text.split("### 机床明细", 1)[1].split("\n### ", 1)[0]
        rows = re.findall(r"^\| ([^|\n]+) \| (\d+) 台 \|", detail, re.MULTILINE)
        self.assertTrue(rows, "Machine breakdown cannot be empty")
        names = [name.strip() for name, _ in rows]
        self.assertEqual(len(names), len(set(names)), "Do not duplicate machine rows")
        counts = [int(quantity) for _, quantity in rows]
        self.assertTrue(all(quantity > 0 for quantity in counts))
        self.assertEqual(sum(counts), int(summary.group(1)))

    def test_table_checker_detects_missing_cell_and_accepts_escaped_pipe(self):
        broken = "| Item | Quantity |\n| --- | --- |\n| Drill |"
        self.assertEqual(table_width_errors(broken), [(3, 2, 1)])
        valid = "| Item | Quantity |\n| --- | --- |\n| A\\|B | 4 |"
        self.assertEqual(table_width_errors(valid), [])

    def test_checker_accepts_encoded_local_paths_and_external_links(self):
        text = "[design](%E7%BD%91%E9%A1%B5%E8%AE%BE%E8%AE%A1.md) [web](https://example.com/a)"
        self.assertEqual(missing_local_links(ROOT / "example.md", text), [])

    def test_checker_rejects_unclosed_fence(self):
        with self.assertRaises(ValueError):
            markdown_body("```text\nunclosed")
        self.assertEqual(markdown_body("~~~text\nexample\n~~~\nvisible"), "visible")

    def test_checker_rejects_links_outside_repository(self):
        # Even an existing outside file cannot be a portable project reference.
        with tempfile.TemporaryDirectory() as directory:
            temporary_root = Path(directory).resolve()
            target = temporary_root / "outside.md"
            target.write_text("External reference", encoding="utf-8")
            document = temporary_root / "nested" / "example.md"
            with mock.patch(__name__ + ".ROOT", temporary_root / "nested"):
                self.assertEqual(missing_local_links(document, "[outside](../outside.md)"), ["../outside.md"])

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
