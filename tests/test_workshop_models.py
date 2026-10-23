"""Guard the stage-2 static model review page.

Covers only local files: the two machine models, the review page, its local
entry/build inputs and the isolation of the public website. No network access.
"""

from pathlib import Path
from urllib.parse import urlparse
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / "demos" / "mill-assembly"


def read(name: str) -> str:
    return (DEMO / name).read_text(encoding="utf-8")


class ModelReviewTests(unittest.TestCase):
    def test_both_machines_and_review_files_exist_with_exports(self):
        self.assertIn("export function createLathe", read("lathe-model.js"))
        self.assertIn("export function createLaser", read("laser-model.js"))
        for name in ("model-review.html", "model-review.js", "model-review.css", "模型初审.md"):
            self.assertTrue((DEMO / name).is_file(), name)
        html = read("model-review.html")
        self.assertIn('src="./model-review.js"', html)
        self.assertIn('href="./model-review.css"', html)
        self.assertIn("<title>设备模型 · 初步审阅</title>", html)

    def test_review_copy_and_controls(self):
        html = read("model-review.html")
        for text in ("设备模型 · 初步审阅", "拖动旋转 · 滚轮缩放", "通用结构示意", "车床", "激光切割机", "正面", "俯视", "复位视角"):
            self.assertIn(text, html)
        self.assertEqual(html.count('data-machine="'), 2)
        self.assertEqual(html.count('data-view="'), 3)
        self.assertEqual(html.count('aria-pressed="true"'), 1, "only the default lathe starts pressed")
        self.assertIn('data-machine="lathe" aria-pressed="true"', html)
        self.assertNotRegex(html, r"(?:src|href)=[\"']https?://")

    def test_design_brief_precedes_markup(self):
        html = read("model-review.html")
        comment = re.search(r"<!--(.*?)-->", html, re.S)
        self.assertIsNotNone(comment)
        brief = comment.group(1)
        self.assertIn("Primary", brief)
        self.assertIn("Secondary", brief)
        self.assertIn("Tertiary", brief)
        for token in ("#252c2e", "#f8f9f6", "#e9edeb", "#deb66b"):
            self.assertIn(token, brief)
        self.assertLess(html.index("Design brief"), html.index("<html"))
        markup = re.sub(r"<!--.*?-->", "", html, flags=re.S)
        self.assertNotRegex(markup.lower(), r"(?:src|href)=[\"'][^\"']*tailwind")

    def test_review_uses_shared_materials_and_local_assets_only(self):
        js = read("model-review.js")
        self.assertIn("loadMillSurfaceAssets", js)
        self.assertIn("createMillMaterials", js)
        self.assertIn("materials: materials.materials", js)
        self.assertIn("RoomEnvironment", js)
        self.assertIn("OrbitControls", js)
        self.assertNotIn("autoRotate", js, "no automatic rotation")
        self.assertNotIn("setAnimationLoop", js, "no continuous animation loop")
        self.assertNotIn("motion.js", js, "no assembly timeline on the static review page")
        self.assertIn("window.__modelReview", js)
        for api in ("setMachine", "setView", "getState", "getModels", "getCamera", "getScene", "getRenderStats"):
            self.assertIn(api, js)
        self.assertIn("parts.length", js)
        self.assertNotRegex(js, r"(?:fetch|import)\s*\(\s*[\"']https?://")
        css = read("model-review.css")
        for token in ("#252c2e", "#f8f9f6", "#e9edeb", "#deb66b", "#79591e"):
            self.assertIn(token, css)
        self.assertRegex(css, r"min-height:\s*44px")
        self.assertIn(":focus-visible", css)

    def test_standalone_build_inputs_both_pages(self):
        config = (ROOT / "vite.demo.config.js").read_text(encoding="utf-8")
        self.assertIn("root: 'demos/mill-assembly'", config)
        self.assertIn("rolldownOptions", config)
        self.assertIn("fileURLToPath(new URL('./demos/mill-assembly/index.html', import.meta.url))", config)
        self.assertIn("fileURLToPath(new URL('./demos/mill-assembly/model-review.html', import.meta.url))", config)
        self.assertNotIn("__dirname", config)

    def test_demo_preview_port_is_configurable(self):
        config = (ROOT / "playwright.demo.config.js").read_text(encoding="utf-8")
        self.assertIn("process.env.MILL_DEMO_PORT", config)
        self.assertIn("|| 4175", config)
        self.assertIn("const port = Number(process.env.MILL_DEMO_PORT || 4175);", config)
        self.assertIn("const origin = `http://127.0.0.1:${port}`;", config)
        self.assertIn("baseURL: origin", config)
        self.assertIn("url: origin", config)

    def test_review_isolation_from_the_website(self):
        site_config = (ROOT / "vite.config.js").read_text(encoding="utf-8")
        self.assertNotIn("mill-assembly", site_config)
        self.assertNotIn("model-review", site_config)
        shipped = [ROOT / "site", ROOT / "public"]
        for path in (file for base in shipped if base.is_dir() for file in base.rglob("*")):
            if path.is_file() and path.suffix in {".html", ".js", ".css", ".md"}:
                text = path.read_text(encoding="utf-8", errors="ignore")
                self.assertNotIn("model-review", text, str(path))
                self.assertNotIn("__modelReview", text, str(path))
        landing = (DEMO / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("model-review", landing, "the mill preview keeps its original entry point")

    def test_review_notes_state_draft_and_references(self):
        notes = read("模型初审.md")
        self.assertIn("初稿", notes)
        self.assertIn("待用户审核", notes)
        self.assertIn("联合", notes)
        links = re.findall(r"https?://[^\s)>]+", notes)
        self.assertTrue(links)
        for link in links:
            self.assertTrue(urlparse(link).scheme in {"http", "https"})
        self.assertNotRegex(notes, r"型号[：:]\s*\w")


if __name__ == "__main__":
    unittest.main()
