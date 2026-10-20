"""Verify the procedural model fallback and its separate provenance record."""
import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "site/public/images/generated"


class AssemblyAssetTests(unittest.TestCase):
    def test_poster_has_matching_local_source_and_hash(self):
        record = json.loads((DIRECTORY / "chuck-assembly.json").read_text(encoding="utf-8"))
        self.assertEqual(record["kind"], "procedural-render")
        self.assertEqual(record["file"], "chuck-assembly.webp")
        data = (DIRECTORY / record["file"]).read_bytes()
        self.assertEqual(data[:4], b"RIFF")
        self.assertEqual(data[8:12], b"WEBP")
        self.assertEqual(len(data), record["bytes"])
        self.assertEqual(hashlib.sha256(data).hexdigest(), record["sha256"])
        self.assertLess(len(data), 200_000)
        self.assertEqual((record["width"], record["height"]), (1200, 1000))
        for name in ["source", "renderer"]:
            source = (ROOT / record[name]).resolve()
            self.assertTrue(source.is_relative_to(ROOT) and source.is_file())
        self.assertIn("非本厂产品或客户案例", record["usage"])

    def test_generated_model_is_distinguished_from_reference_photographs(self):
        page = (ROOT / "site/index.html").read_text(encoding="utf-8")
        self.assertIn('./images/generated/chuck-assembly.webp', page)
        self.assertIn("非本厂产品或客户案例", page)
        records = json.loads((ROOT / "site/public/images/credits.json").read_text(encoding="utf-8"))
        self.assertNotIn("chuck-assembly.webp", {record["file"] for record in records})
        for name in ["README.md", "素材说明.md"]:
            self.assertIn("chuck-assembly", (ROOT / name).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
