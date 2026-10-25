"""Verify generated local background assets and their provenance bundle."""
import hashlib
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'demos' / 'mill-assembly' / 'assets' / 'backgrounds'


class WorkshopBackgroundTests(unittest.TestCase):
    def test_three_webp_plates_have_matching_hashes_and_dimensions(self):
        entries = json.loads((ASSETS / 'sources.json').read_text(encoding='utf-8'))['assets']
        self.assertEqual({entry['id'] for entry in entries}, {'studio', 'airflow', 'blueprint'})
        self.assertEqual(len(entries), 3)
        total = 0
        for entry in entries:
            with self.subTest(background=entry['id']):
                path = ASSETS / entry['file']
                self.assertEqual(path.parent, ASSETS)
                data = path.read_bytes()
                self.assertEqual(data[:4], b'RIFF')
                self.assertEqual(data[8:12], b'WEBP')
                self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'])
                self.assertEqual(len(data), entry['bytes'])
                marker = data.index(b'\x9d\x01\x2a', 20, 64) + 3
                width = int.from_bytes(data[marker:marker + 2], 'little') & 0x3fff
                height = int.from_bytes(data[marker + 2:marker + 4], 'little') & 0x3fff
                self.assertEqual((width, height), (entry['width'], entry['height']))
                self.assertGreaterEqual(width, 1600)
                self.assertGreaterEqual(height, 900)
                self.assertIn('not a photograph of the actual workshop', entry['note'])
                total += len(data)
        self.assertLess(total, 1_000_000)

    def test_prompts_and_generator_are_saved_for_all_three_backgrounds(self):
        bundle = json.loads((ASSETS / 'prompts.json').read_text(encoding='utf-8'))
        self.assertEqual(bundle['generator'], 'Built-in image_gen')
        self.assertEqual({entry['key'] for entry in bundle['prompts']}, {'studio', 'airflow', 'blueprint'})
        for entry in bundle['prompts']:
            self.assertGreater(len(entry['prompt']), 300)
        notes = (ROOT / 'demos' / 'mill-assembly' / '背景与机台文字.md').read_text(encoding='utf-8')
        self.assertIn('生成', notes)
        self.assertIn('sources.json', notes)


if __name__ == '__main__':
    unittest.main()
