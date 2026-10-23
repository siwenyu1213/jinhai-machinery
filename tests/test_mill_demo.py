"""Guard the standalone prototype's delivery and website separation."""

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demos" / "mill-assembly"


class MillDemoTests(unittest.TestCase):
    def test_demo_is_complete_and_has_explicit_launch_commands(self):
        for name in ("index.html", "main.js", "style.css", "model.js", "materials.js", "motion.js", "README.md"):
            self.assertTrue((DEMO / name).is_file(), name)
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        for command in ("demo:dev", "demo:build", "demo:preview", "test:demo"):
            self.assertIn(command, package["scripts"])
        self.assertIn("test:demo", package["scripts"]["test"])

    def test_demo_has_no_remote_runtime_or_machine_texture_downloads(self):
        for name in ("index.html", "main.js", "model.js", "materials.js", "motion.js", "style.css"):
            content = (DEMO / name).read_text(encoding="utf-8")
            self.assertNotRegex(content, r"(?:src|href)=[\"']https?://", name)
            self.assertNotRegex(content, r"(?:fetch|import)\s*\(\s*[\"']https?://", name)
            self.assertNotIn("TextureLoader", content, name)

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
