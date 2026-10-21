"""Keep the requested concise copy and reference provenance reviewable."""

import re
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class BodyText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skipped = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"head", "script", "style", "svg"}:
            self.skipped += 1

    def handle_endtag(self, tag):
        if tag in {"head", "script", "style", "svg"}:
            self.skipped -= 1

    def handle_data(self, data):
        if not self.skipped:
            self.parts.append(data)


class ReferenceDesignTests(unittest.TestCase):
    def test_source_copy_budget_includes_fallbacks_and_dialogs(self):
        parser = BodyText()
        parser.feed((ROOT / "site/index.html").read_text(encoding="utf-8"))
        text = re.sub(r"\s", "", "".join(parser.parts))
        self.assertLessEqual(len(text), 1500)
        for boundary in ["不用于商业接单", "大件需沟通协商", "超出以下范围的上门维修需求不接", "非本厂产品或客户案例", "真实联系方式尚未提供"]:
            with self.subTest(boundary=boundary):
                self.assertIn(boundary, text)

    def test_reference_record_distinguishes_extraction_from_observation(self):
        reference = (ROOT / "设计参考.md").read_text(encoding="utf-8")
        self.assertIn("https://www.kinlong.com/", reference)
        self.assertIn("1873741ba8dea755e35e6e15134f7918cd58e036", reference)
        self.assertIn("初次色板为空", reference)
        self.assertIn("浏览器样式取值和截图", reference)
        self.assertIn("参考站的 Logo、建筑照片、视频", reference)


if __name__ == "__main__":
    unittest.main()
