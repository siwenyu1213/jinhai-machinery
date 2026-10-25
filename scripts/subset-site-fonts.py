"""Build small, renamed OFL subsets from the reviewed original font files.

Run: uv run --no-project --with 'fonttools[woff]==4.60.1' python scripts/subset-site-fonts.py
This utility does not add an application dependency or modify installed fonts.
"""
import hashlib
import json
import shutil
from pathlib import Path

from fontTools import __version__
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
ORIGINALS = ROOT / 'design-previews/typography'
OUTPUT = ROOT / 'site/public/fonts'
DISPLAY = '金海机械把想法，加工成形。铣床车床激光切割机三机·旋转装配从结构，看懂机台。'
ASCII = set(range(32, 127))


def source_characters():
    """Include markup, map labels and runtime copy; new unknown characters retain system fallback."""
    text = ''
    for folder in [ROOT / 'site', ROOT / 'demos/mill-assembly']:
        for path in sorted(folder.rglob('*')):
            if 'dist' in path.parts or OUTPUT in path.parents:
                continue
            if path.suffix in {'.html', '.js', '.json', '.geojson', '.svg', '.css'}:
                text += path.read_text(encoding='utf-8')
    return ASCII | {ord(char) for char in text if ord(char) >= 160}


def build():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source_manifest = json.loads((ORIGINALS / 'sources.json').read_text(encoding='utf-8'))
    originals = {Path(item['file']).name: item for item in source_manifest['fonts']}
    body = source_characters()
    display = ASCII | {ord(char) for char in DISPLAY}
    configurations = [
        ('SmileySans-Oblique.woff2', 'jinhai-display.woff2', 'Jinhai Display', 'Regular', display),
        ('IBMPlexSansSC-Regular.woff2', 'jinhai-text-regular.woff2', 'Jinhai Text', 'Regular', body),
        ('IBMPlexSansSC-SemiBold.woff2', 'jinhai-text-semibold.woff2', 'Jinhai Text', 'SemiBold', body),
        ('IBMPlexSansCondensed-Regular.woff2', 'jinhai-narrow-regular.woff2', 'Jinhai Narrow', 'Regular', ASCII),
        ('IBMPlexSansCondensed-SemiBold.woff2', 'jinhai-narrow-semibold.woff2', 'Jinhai Narrow', 'SemiBold', ASCII),
    ]
    manifest = {'tool': f'fontTools {__version__}', 'license': 'SIL Open Font License 1.1',
                'changes': 'Unicode subsetting and internal family renaming; original glyph outlines and copyright notices retained.', 'fonts': []}
    for source, filename, family, style, unicodes in configurations:
        original = ORIGINALS / 'fonts' / source
        source_hash = hashlib.sha256(original.read_bytes()).hexdigest()
        if source_hash != originals[source]['sha256']:
            raise ValueError(f'Original font changed: {source}')
        font = TTFont(original, recalcTimestamp=False)
        options = Options()
        options.layout_features = ['*']
        options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
        options.name_languages = ['*']
        options.recalc_timestamp = False
        subsetter = Subsetter(options=options)
        subsetter.populate(unicodes=unicodes)
        subsetter.subset(font)
        postscript = family.replace(' ', '') + '-' + style
        names = {1: family, 2: style, 3: postscript + '-Subset-1', 4: family + ' ' + style,
                 6: postscript, 16: family, 17: style}
        for name_id, value in names.items():
            for record in list(font['name'].names):
                if record.nameID == name_id:
                    font['name'].setName(value, name_id, record.platformID, record.platEncID, record.langID)
            font['name'].setName(value, name_id, 3, 1, 0x409)
        font.flavor = 'woff2'
        target = OUTPUT / filename
        font.save(target)
        coverage = sorted(font.getBestCmap())
        manifest['fonts'].append({'file': filename, 'family': family, 'style': style,
            'source': f'design-previews/typography/fonts/{source}', 'sourceSha256': source_hash,
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'bytes': target.stat().st_size,
            'sourceBytes': original.stat().st_size, 'codepoints': coverage})
        font.close()
    for license_file in ['SmileySans-LICENSE.txt', 'IBMPlex-LICENSE.txt']:
        shutil.copyfile(ORIGINALS / 'fonts' / license_file, OUTPUT / license_file)
    (OUTPUT / 'sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    total = sum(font['bytes'] for font in manifest['fonts'])
    print(json.dumps({'fonts': len(manifest['fonts']), 'bytes': total, 'originalBytes': sum(font['sourceBytes'] for font in manifest['fonts'])}))


if __name__ == '__main__':
    build()
