"""Check service geography against the saved upstream data, not a drawn guess."""

import hashlib
import importlib.util
import json
import math
import re
import subprocess
import sys
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
MAPS = ROOT / "site/public/maps"
SPEC = importlib.util.spec_from_file_location("scope_map", ROOT / "scripts/build-scope-map.py")
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)
SVG = {"s": "http://www.w3.org/2000/svg"}
COVERAGE = {350582, 350583, 350581, 350502, 350503}


class ServiceMapIntegrityTests(unittest.TestCase):
    def test_geographic_source_and_provenance_match(self):
        raw = (MAPS / "quanzhou.geojson").read_bytes()
        record = json.loads((MAPS / "source.json").read_text(encoding="utf-8"))
        source = json.loads(raw)
        self.assertEqual(record["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(record["bytes"], len(raw))
        self.assertTrue(raw.endswith(b"\n") and not raw.endswith(b"\n\n"))
        attributes = subprocess.run(["git", "check-attr", "eol", "--", "site/public/maps/quanzhou.geojson"], cwd=ROOT, capture_output=True, text=True, check=True)
        self.assertIn(": eol: lf", attributes.stdout, "Keep source hashes stable on Windows and Linux")
        self.assertEqual(record["source"], "https://geo.datav.aliyun.com/areas_v3/bound/350500_full.json")
        self.assertEqual(record["source_updated"], "2021-05")
        self.assertEqual(set(record["coverage_adcodes"]), COVERAGE)
        self.assertEqual(source["type"], "FeatureCollection")
        self.assertEqual(len(source["features"]), 12)
        codes = {feature["properties"]["adcode"] for feature in source["features"]}
        self.assertTrue(COVERAGE < codes)
        for feature in source["features"]:
            self.assertEqual(feature["properties"]["parent"]["adcode"], 350500)

    def test_static_map_is_reproducible_and_only_five_regions_are_covered(self):
        result = subprocess.run([sys.executable, "-X", "utf8", "scripts/build-scope-map.py", "--check"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        source = json.loads((MAPS / "quanzhou.geojson").read_text(encoding="utf-8"))
        markup = BUILDER.render_map(source)
        fragment = ET.fromstring(f'<svg xmlns="http://www.w3.org/2000/svg">{markup}</svg>')
        covered = fragment.findall('s:g[@data-scope-region]', SVG)
        self.assertEqual({int(element.attrib["data-adcode"]) for element in covered}, COVERAGE)
        self.assertEqual(len(covered), 5)
        self.assertEqual(len(fragment.findall('s:use[@class="scope-context"]', SVG)), 7)
        for element in fragment.findall('s:defs/s:path', SVG):
            self.assertNotRegex(element.attrib["d"], r"nan|inf")
            self.assertGreater(len(element.attrib["d"]), 100)
        for code in COVERAGE:
            props = next(feature["properties"] for feature in source["features"] if feature["properties"]["adcode"] == code)
            x, y = BUILDER.project(props["centroid"])
            self.assertTrue(math.isfinite(x) and 0 < x < 1000)
            self.assertTrue(math.isfinite(y) and 0 < y < 820)

    def test_every_machine_symbol_and_its_internal_references_exist(self):
        root = ET.parse(MAPS / "machines.svg").getroot()
        symbols = root.findall('s:symbol', SVG)
        self.assertEqual({symbol.attrib["id"] for symbol in symbols}, {"lathe", "drill", "mill", "laser", "press"})
        ids = {element.attrib["id"] for element in root.iter() if "id" in element.attrib}
        for symbol in symbols:
            self.assertEqual(symbol.attrib["viewBox"], "0 0 240 180")
            self.assertGreater(len(list(symbol.iter())), 18, "Equipment needs recognizable mechanical parts")
        self.assertEqual(root.findall('.//s:script', SVG), [])
        for element in root.iter():
            for key, value in element.attrib.items():
                self.assertFalse(key.lower().startswith("on"))
                if key == "href":
                    self.assertTrue(value.startswith("#"))
                    self.assertIn(value[1:], ids)
                for reference in re.findall(r"url\(#([^)]+)\)", value):
                    self.assertIn(reference, ids)

    def test_documentation_keeps_coverage_and_equipment_boundaries_explicit(self):
        documentation = (ROOT / "README.md").read_text(encoding="utf-8")
        for name in ("晋江", "南安", "石狮", "鲤城", "丰泽", "2021", "驻点", "可维修机型"):
            self.assertIn(name, documentation)
        for path in ("site/public/maps/source.json", "scripts/build-scope-map.py", "tests/browser/scope-map.spec.js"):
            self.assertIn(path, documentation)


if __name__ == "__main__":
    unittest.main()
