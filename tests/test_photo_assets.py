"""Verify the local photographic assets and their attribution records."""

import hashlib
import json
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "site/public/images"


class ImageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, tag, attrs):
        if tag == "img":
            self.images.append(dict(attrs))


class PhotographyIntegrityTests(unittest.TestCase):
    def test_photographs_have_complete_and_matching_attribution(self):
        records = json.loads((IMAGES / "credits.json").read_text(encoding="utf-8"))
        self.assertTrue(records)
        self.assertEqual(len(records), len({record["file"] for record in records}))
        self.assertEqual({record["file"] for record in records}, {path.name for path in IMAGES.glob("*.webp")})
        for record in records:
            with self.subTest(photo=record["file"]):
                self.assertEqual(Path(record["file"]).name, record["file"])
                data = (IMAGES / record["file"]).read_bytes()
                self.assertEqual(data[:4], b"RIFF")
                self.assertEqual(data[8:12], b"WEBP")
                self.assertEqual(record["bytes"], len(data))
                self.assertEqual(record["sha256"], hashlib.sha256(data).hexdigest())
                self.assertLess(len(data), 500_000, "Keep each delivered photograph below 500 KB")
                self.assertGreaterEqual(record["width"], 1200)
                self.assertGreater(record["height"], 0)
                self.assertTrue(record["author"])
                self.assertTrue(record["subject"])
                self.assertEqual(record["license"], "Unsplash License")
                self.assertEqual(record["license_url"], "https://unsplash.com/license")
                self.assertEqual(urlsplit(record["source"]).netloc, "unsplash.com")
                self.assertTrue(urlsplit(record["source"]).path.startswith("/photos/"))
                self.assertEqual(urlsplit(record["download"]).netloc, "images.unsplash.com")
                self.assertIn("非本厂实拍", record["usage"])

    def test_page_uses_local_photography_with_accessible_descriptions(self):
        parser = ImageParser()
        parser.feed((ROOT / "site/index.html").read_text(encoding="utf-8"))
        photographs = [image for image in parser.images if image.get("src")]
        self.assertTrue(photographs)
        for image in photographs:
            with self.subTest(photo=image["src"]):
                self.assertTrue(image["src"].startswith("./images/"))
                self.assertTrue(image["src"].endswith(".webp"))
                self.assertTrue((ROOT / "site/public" / image["src"]).is_file())
                self.assertGreater(len(image["alt"]), 8)
                self.assertGreater(int(image["width"]), 0)
                self.assertGreater(int(image["height"]), 0)
        for old in ("custom.svg", "sheet.svg", "repair.svg"):
            self.assertFalse((IMAGES / old).exists(), "Do not retain the superseded drawn models")


if __name__ == "__main__":
    unittest.main()
