"""Production fonts retain provenance and cover the site's current text."""
import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / 'site/public/fonts'


class SiteFontTests(unittest.TestCase):
    def test_subsets_are_small_renamed_and_traceable_to_the_reviewed_originals(self):
        manifest = json.loads((FONTS / 'sources.json').read_text(encoding='utf-8'))
        self.assertEqual(len(manifest['fonts']), 5)
        self.assertLess(sum(font['bytes'] for font in manifest['fonts']), 600000)
        for font in manifest['fonts']:
            data = (FONTS / font['file']).read_bytes()
            self.assertEqual(data[:4], b'wOF2')
            self.assertEqual(hashlib.sha256(data).hexdigest(), font['sha256'])
            self.assertEqual(hashlib.sha256((ROOT / font['source']).read_bytes()).hexdigest(), font['sourceSha256'])
            self.assertTrue(font['family'].startswith('Jinhai '))
            self.assertTrue(set(range(32, 127)).issubset(font['codepoints']))
        for filename in ['SmileySans-LICENSE.txt', 'IBMPlex-LICENSE.txt']:
            self.assertIn('SIL OPEN FONT LICENSE', (FONTS / filename).read_text(encoding='utf-8'))

    def test_display_subset_covers_headlines_and_machine_titles(self):
        manifest = json.loads((FONTS / 'sources.json').read_text(encoding='utf-8'))
        display = next(font for font in manifest['fonts'] if font['family'] == 'Jinhai Display')
        text = '金海机械把想法，加工成形。铣床车床激光切割机三机·旋转装配'
        self.assertTrue({ord(char) for char in text}.issubset(display['codepoints']))

    def test_both_website_entries_preload_only_the_two_critical_local_faces(self):
        for filename in ['index.html', 'machines.html']:
            page = (ROOT / 'site' / filename).read_text(encoding='utf-8')
            self.assertEqual(page.count('as="font"'), 2)
            self.assertIn('./fonts/jinhai-display.woff2', page)
            self.assertIn('./fonts/jinhai-text-regular.woff2', page)
        faces = (ROOT / 'site/src/styles/font-faces.css').read_text(encoding='utf-8')
        self.assertEqual(faces.count('font-display: swap'), 5)
        self.assertNotIn('https://', faces)

    def test_body_subsets_cover_both_scroll_transition_titles(self):
        manifest = json.loads((FONTS / 'sources.json').read_text(encoding='utf-8'))
        text = '我们有哪些机台？我们还有更多……'
        for font in manifest['fonts']:
            if font['family'] == 'Jinhai Text':
                self.assertTrue({ord(char) for char in text}.issubset(font['codepoints']))
