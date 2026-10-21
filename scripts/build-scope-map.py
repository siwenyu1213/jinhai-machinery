"""Regenerate the static, script-independent service map from its saved GeoJSON."""

import argparse
import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAPS = ROOT / "site/public/maps"
START = "<!-- scope-map:generated:start -->"
END = "<!-- scope-map:generated:end -->"
REGIONS = {
    350582: ("jinjiang", "晋江", "lathe", "车床", (800, 760)),
    350583: ("nanan", "南安", "drill", "钻床", (450, 890)),
    350581: ("shishi", "石狮", "mill", "铣床", (730, 450)),
    350502: ("licheng", "鲤城", "laser", "激光切割机", (190, 720)),
    350503: ("fengze", "丰泽", "press", "折弯机", (190, 500)),
}
WIDE_ANCHORS = {
    "jinjiang": (900, 700),
    "nanan": (430, 820),
    "shishi": (900, 440),
    "licheng": (180, 650),
    "fengze": (300, 420),
}


def project(point):
    """Rotate the local Mercator projection 90 degrees: east up, west down."""
    lon, lat = point
    mercator = lambda value: math.log(math.tan(math.pi / 4 + math.radians(value) / 2))
    east = (lon - 118) * 820 + 44
    south = (mercator(25.39) - mercator(lat)) * 820 * 180 / math.pi + 8
    return south, 1000 - east


def path_data(geometry):
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    parts = []
    for polygon in polygons:
        for ring in polygon:
            points = [project(point) for point in ring]
            parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in points) + "Z")
    return "".join(parts)


def render_map(source):
    lines = ["<defs>"]
    for feature in source["features"]:
        code = feature["properties"]["adcode"]
        lines.append(f'<path id="scope-boundary-{code}" d="{path_data(feature["geometry"])}"/>')
    lines.append("</defs>")
    # Context stays below the five covered regions and never becomes a control.
    features = sorted(source["features"], key=lambda feature: feature["properties"]["adcode"] in REGIONS)
    for feature in features:
        props = feature["properties"]
        code = props["adcode"]
        if code in REGIONS:
            key, name, _, machine, _ = REGIONS[code]
            lines.extend([
                f'<g class="scope-region scope-color-{key}" data-scope-region="{key}" data-adcode="{code}" aria-label="{name}，可上门，{machine}交互示意">',
                f'<title>{name} · 可上门机台维修</title>',
                f'<use class="scope-region-depth" href="#scope-boundary-{code}"/>',
                f'<use class="scope-region-face" href="#scope-boundary-{code}"/>',
                f'<use class="scope-region-hit" href="#scope-boundary-{code}"/>',
                '</g>',
            ])
        else:
            lines.append(f'<use class="scope-context" data-adcode="{code}" href="#scope-boundary-{code}"><title>{props["name"]} · 不在上门范围</title></use>')
    lines.append('<g class="scope-map-leaders" aria-hidden="true">')
    for code, (key, _, _, _, anchor) in REGIONS.items():
        props = next(feature["properties"] for feature in source["features"] if feature["properties"]["adcode"] == code)
        x, y = project(props["centroid"])
        ax, ay = anchor
        wx, wy = WIDE_ANCHORS[key]
        lines.append(f'<g class="scope-link scope-color-{key}" data-scope-link="{key}" data-origin="{x:.1f},{y:.1f}" data-compact-end="{ax},{ay}" data-wide-end="{wx},{wy}"><path d="M{x:.1f},{y:.1f}L{ax},{ay}"/><circle cx="{x:.1f}" cy="{y:.1f}" r="5"/></g>')
    lines.append('</g>')
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check the saved markup without changing it")
    args = parser.parse_args()
    raw = (MAPS / "quanzhou.geojson").read_bytes()
    record = json.loads((MAPS / "source.json").read_text(encoding="utf-8"))
    if hashlib.sha256(raw).hexdigest() != record["sha256"]:
        raise SystemExit("Map source hash does not match its provenance record")
    markup = render_map(json.loads(raw))
    page = ROOT / "site/index.html"
    before, remainder = page.read_text(encoding="utf-8").split(START, 1)
    current, after = remainder.split(END, 1)
    expected = "\n" + markup + "\n"
    if args.check:
        if current != expected:
            raise SystemExit("Map markup is stale: run python -X utf8 scripts/build-scope-map.py")
        print("Service map matches the saved geographic source.")
    else:
        page.write_text(before + START + expected + END + after, encoding="utf-8", newline="\n")
        print("Regenerated the static service map.")


if __name__ == "__main__":
    main()
