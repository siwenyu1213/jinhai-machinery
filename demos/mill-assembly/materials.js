import {
  ClampToEdgeWrapping, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace,
} from 'three';

// Deterministic, CPU-generated tileable textures for the mill. All sources are
// DataTextures driven by a seeded PRNG, so Node (no DOM/canvas) and repeated
// createMill() calls produce identical pixels with zero network access.
const SIZE = 128;

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bilinear, wrap-addressed lattice bump field in [0, 1], sampled at frequency f.
function lattice(seed, frequency) {
  const random = rng(seed);
  const size = frequency;
  const values = new Float32Array(size * size);
  for (let index = 0; index < values.length; index++) values[index] = random();
  const at = (x, y) => values[(y % size) * size + (x % size)];
  return (u, v) => {
    const x = u * size;
    const y = v * size;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
    const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
}

function fractal(seed, frequencies) {
  const fields = frequencies.map((frequency) => lattice(seed * 31 + frequency, frequency));
  let total = 0;
  for (const frequency of frequencies) total += frequency;
  return (u, v) => {
    let value = 0;
    fields.forEach((field, index) => { value += field(u, v) * frequencies[index]; });
    return value / total;
  };
}

function createTexture(name, fill, { colorSpace = null, role = 'detail', wrap = RepeatWrapping } = {}) {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const color = fill(x / SIZE, y / SIZE);
    const offset = (y * SIZE + x) * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = color[3] ?? 255;
  }
  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat);
  texture.name = name;
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.magFilter = LinearFilter; // no blocky texels up close
  texture.minFilter = LinearMipmapLinearFilter; // stable in the distance
  texture.generateMipmaps = true;
  texture.anisotropy = 1; // Raised per renderer by the scene if it supports it.
  if (colorSpace) texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  texture.userData = { materialRole: role, surfaceDetail: 'mill-texture' };
  return texture;
}

const clamp255 = (value) => Math.max(0, Math.min(255, Math.round(value)));
const grayscale = (value) => [clamp255(value), clamp255(value), clamp255(value), 255];

export function createMillMaterials() {
  const textures = new Set();

  // 1. Poured-cast iron: broad mottling plus a fine pinhole grain (bump only).
  const cast = fractal(11, [3, 6, 13]);
  const pinhole = fractal(23, [19, 37]);
  const roughness = fractal(37, [5, 11, 29]);
  const castBump = createTexture('painted-cast-bump', (u, v) => {
    const grain = (pinhole(u, v) - .5) * .5;
    return grayscale(128 + (cast(u, v) - .5) * 30 + grain * 115);
  }, { role: 'cast-bump' });
  // 2. Paint roughness lives in green: fine orange-peel, mostly in [.8, 1].
  const paintRoughness = createTexture('paint-roughness', (u, v) => {
    const peel = .5 + (pinhole(u, v) - .5) * .32 + (cast(u, v) - .5) * .18;
    const value = 205 + (roughness(u, v) - .5) * 24 + (peel - .5) * 22;
    const g = clamp255(value);
    return [g, g, g, 255];
  }, { role: 'paint-roughness' });
  // A small albedo variation keeps the cast grain readable under broad light;
  // the bump still supplies its relief. There is no baked directional shading.
  const paintTone = createTexture('paint-tone', (u, v) => {
    return grayscale(242 + (pinhole(u, v) - .5) * 28 + (cast(u, v) - .5) * 8);
  }, { colorSpace: SRGBColorSpace, role: 'paint-tone' });
  // 3. Fine directional machining: light streak along U, micro scrub across V.
  const scrub = fractal(41, [32, 64]);
  // Fine, straight parallel grinding lines along U (no sine wobble that reads as wood).
  const machinedBump = createTexture('machined-bump', (u, v) => {
    const line = .5 + .3 * Math.sin(v * Math.PI * 2 * 24);
    const value = 128 + (line - .5) * 40 + (scrub(u, v) - .5) * 34;
    return grayscale(value);
  }, { role: 'machined-bump' });
  // 4. Mild relief for the table / way surfaces, same fine direction.
  const wayBump = createTexture('way-bump', (u, v) => {
    const value = 128 + (scrub(u, v) - .5) * 40 + .12 * Math.sin(v * Math.PI * 2 * 11);
    return [clamp255(value), clamp255(value * .96), clamp255(value * .9), 255];
  }, { role: 'way-bump' });
  // 5. Shared soft-edged oil sheen: flat center, fully transparent 6px rim.
  const breakup = fractal(53, [4, 9]);
  const EDGE = 6;
  const oil = createTexture('oil-sheen', (u, v) => {
    const px = u * SIZE;
    const py = v * SIZE;
    if (px < EDGE || py < EDGE || px > SIZE - EDGE || py > SIZE - EDGE) return [0, 0, 0, 0];
    const dx = u - .5;
    const dy = (v - .5) * .92;
    const radius = Math.sqrt(dx * dx + dy * dy);
    const wobble = (breakup(u, v) - .5) * .12;
    const edge = Math.max(0, Math.min(1, (.40 - radius + wobble) / .14));
    const alpha = Math.pow(edge, 1.4) * Math.min(1, Math.min(px - EDGE, py - EDGE, SIZE - EDGE - px, SIZE - EDGE - py) / 6);
    const rgb = edge > 0 ? [104 + edge * 16, 66 + edge * 8, 30 + edge * 4] : [0, 0, 0];
    return [clamp255(rgb[0]), clamp255(rgb[1]), clamp255(rgb[2]), clamp255(alpha * 255)];
  }, { colorSpace: SRGBColorSpace, role: 'oil-sheen', wrap: ClampToEdgeWrapping });
  // 6. Short downward run-off: narrow on top, feathering to a thin tail,
  // transparent left/right and top/bottom borders.
  const oilRun = createTexture('oil-run', (u, v) => {
    const px = u * SIZE;
    const py = v * SIZE;
    if (px < EDGE || px > SIZE - EDGE || py < EDGE || py > SIZE - EDGE) return [0, 0, 0, 0];
    const x = Math.abs(u - .5) * 2;
    const width = .30 + .62 * Math.pow(Math.max(0, v - .35) / .65, 1.6);
    const body = Math.max(0, Math.min(1, (width - x) / .18));
    const tip = v < .12 ? v / .12 : v > .9 ? Math.max(0, 1 - (v - .9) / .1) : 1;
    const alpha = Math.pow(body, 1.5) * tip * (1 + (breakup(u, v) - .5) * .3);
    const rgb = [86, 54, 24];
    return [rgb[0], rgb[1], rgb[2], clamp255(Math.min(1, alpha) * 255)];
  }, { colorSpace: SRGBColorSpace, role: 'oil-run', wrap: ClampToEdgeWrapping });

  // Shared sources; no duplicate GPU textures for different paint colors.
  textures.add(castBump);
  textures.add(paintRoughness);
  textures.add(paintTone);
  textures.add(machinedBump);
  textures.add(wayBump);
  textures.add(oil);
  textures.add(oilRun);

  const paint = (name, color) => {
    const material = new MeshStandardMaterial({
      color, map: paintTone, roughness: .92, metalness: .02, bumpMap: castBump, bumpScale: .13, roughnessMap: paintRoughness,
    });
    material.name = name;
    material.userData = { materialRole: 'painted-cast-iron', surfaceDetail: 'cast-texture' };
    return material;
  };

  castBump.repeat.set(4, 4);
  paintRoughness.repeat.set(2, 2);
  paintTone.repeat.set(4, 4);

  const machined = new MeshStandardMaterial({
    color: '#cdd2cf', roughness: .34, metalness: .9, bumpMap: machinedBump, bumpScale: .03,
  });
  machined.name = 'machined';
  machined.userData = { materialRole: 'machined-steel', surfaceDetail: 'machined-streaks' };

  const way = new MeshStandardMaterial({
    color: '#b9bfbd', roughness: .32, metalness: .85, bumpMap: wayBump, bumpScale: .035,
  });
  way.name = 'steel';
  way.userData = { materialRole: 'bare-steel', surfaceDetail: 'way-grind' };

  const materialSet = {
    body: paint('body', '#74868a'),
    bodyLight: paint('bodyLight', '#9da8a6'),
    steel: way,
    dark: new MeshStandardMaterial({ color: '#35494f', roughness: .74, metalness: .08 }),
    rubber: new MeshStandardMaterial({ color: '#252c2e', roughness: .92, metalness: 0 }),
    accent: new MeshStandardMaterial({ color: '#deb66b', roughness: .6, metalness: .05 }),
    machined,
    fastener: new MeshStandardMaterial({ color: '#5c676b', roughness: .48, metalness: .55 }),
    toolSteel: new MeshStandardMaterial({ color: '#67747a', roughness: .3, metalness: .92 }),
    bronze: new MeshStandardMaterial({ color: '#a88a4b', roughness: .38, metalness: .8 }),
    oil: new MeshStandardMaterial({
      name: 'oil', map: oil, transparent: true, opacity: .48, roughness: .2, metalness: .05,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: DoubleSide,
    }),
    oilRun: new MeshStandardMaterial({
      name: 'oilRun', map: oilRun, transparent: true, opacity: .52, roughness: .22, metalness: .05,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: DoubleSide,
    }),
  };
  materialSet.oil.userData = { materialRole: 'oil-film', surfaceDetail: 'oil-seep' };
  materialSet.oilRun.userData = { materialRole: 'oil-run', surfaceDetail: 'oil-drip' };
  for (const [key, value] of Object.entries(materialSet)) {
    if (!value.userData || !value.userData.materialRole) {
      value.userData = { ...(value.userData || {}), materialRole: key, surfaceDetail: 'plain' };
    }
  }

  let disposed = false;
  return {
    materials: materialSet,
    textures,
    dispose() {
      if (disposed) return;
      disposed = true;
      textures.forEach((texture) => texture.dispose());
      for (const material of Object.values(materialSet)) material.dispose();
      textures.clear();
    },
  };
}
