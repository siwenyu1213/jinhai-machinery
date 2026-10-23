"""Guard the standalone prototype's delivery and website separation."""

import json
import hashlib
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demos" / "mill-assembly"


class MillDemoTests(unittest.TestCase):
    def test_demo_is_complete_and_has_explicit_launch_commands(self):
        for name in ("index.html", "main.js", "style.css", "model.js", "materials.js", "surface-assets.js", "motion.js", "README.md"):
            self.assertTrue((DEMO / name).is_file(), name)
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        for command in ("demo:dev", "demo:build", "demo:preview", "test:demo"):
            self.assertIn(command, package["scripts"])
        self.assertIn("test:demo", package["scripts"]["test"])

    def test_demo_loads_only_bundled_same_origin_assets_at_runtime(self):
        for name in ("index.html", "main.js", "model.js", "materials.js", "surface-assets.js", "motion.js", "style.css"):
            content = (DEMO / name).read_text(encoding="utf-8")
            self.assertNotRegex(content, r"(?:src|href)=[\"']https?://", name)
            self.assertNotRegex(content, r"(?:fetch|import)\s*\(\s*[\"']https?://", name)
        loader = (DEMO / "surface-assets.js").read_text(encoding="utf-8")
        self.assertIn("new URL('./assets/", loader)
        self.assertIn("Promise.allSettled", loader)

    def test_surface_assets_have_sources_licenses_and_matching_hashes(self):
        manifest = json.loads((DEMO / "assets" / "sources.json").read_text(encoding="utf-8"))
        self.assertEqual(len(manifest["assets"]), 4)
        total_bytes = 0
        for asset in manifest["assets"]:
            path = DEMO / "assets" / asset["file"]
            self.assertEqual(path.parent, DEMO / "assets")
            data = path.read_bytes()
            self.assertEqual(asset["license"], "CC0-1.0")
            self.assertTrue(asset["source"].startswith("https://"))
            self.assertEqual(asset["sha256"], hashlib.sha256(data).hexdigest())
            self.assertEqual(asset["bytes"], len(data))
            total_bytes += len(data)
        self.assertLess(total_bytes, 4_000_000, "keep 1K surface assets bounded")
        self.assertTrue((DEMO / "材质参考.md").is_file())

    def test_website_build_and_entry_do_not_import_the_experiment(self):
        config = (ROOT / "vite.config.js").read_text(encoding="utf-8")
        self.assertIn("root: 'site'", config)
        self.assertNotIn("mill-assembly", config)
        for name in ("index.html", "src/main.js"):
            self.assertNotIn("mill-assembly", (ROOT / "site" / name).read_text(encoding="utf-8"))
        standalone = (ROOT / "vite.demo.config.js").read_text(encoding="utf-8")
        self.assertIn("root: 'demos/mill-assembly'", standalone)


if __name__ == "__main__":
    unittest.main()
