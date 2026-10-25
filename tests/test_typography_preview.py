"""The type proposal stays separate from the website and retains original font provenance."""
import hashlib
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREVIEW = ROOT / 'design-previews' / 'typography'


class TypographyPreviewTests(unittest.TestCase):
    def test_original_fonts_and_licenses_have_matching_provenance(self):
        sources = json.loads((PREVIEW / 'sources.json').read_text(encoding='utf-8'))
        self.assertEqual(len(sources['fonts']), 5)
        for entry in sources['fonts']:
            data = (PREVIEW / entry['file']).read_bytes()
            self.assertEqual(data[:4], b'wOF2')
            self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'])
            self.assertIn('github.com', entry['source'])
            self.assertIn('SIL OPEN FONT LICENSE', (PREVIEW / entry['license']).read_text(encoding='utf-8'))

    def test_preview_has_an_independent_build_and_does_not_enter_the_website(self):
        main_config = (ROOT / 'vite.config.js').read_text(encoding='utf-8')
        self.assertNotIn('design-previews', main_config)
        self.assertNotIn('typography', (ROOT / 'site/index.html').read_text(encoding='utf-8'))
        config = (PREVIEW / 'vite.config.js').read_text(encoding='utf-8')
        self.assertIn('127.0.0.1', config)
        self.assertIn("outDir:'dist'", config)
        self.assertIn('尚未应用', (PREVIEW / 'index.html').read_text(encoding='utf-8'))

    def test_machine_poster_reuses_the_existing_model_render(self):
        self.assertEqual((PREVIEW / 'images/lathe.webp').read_bytes(), (ROOT / 'site/public/images/generated/lathe-hero.webp').read_bytes())
