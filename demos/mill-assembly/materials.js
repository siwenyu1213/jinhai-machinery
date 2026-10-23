import {
  ClampToEdgeWrapping, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector2,
} from 'three';

// Deterministic CPU textures keep the model usable in Node and when local PBR
// images fail. The browser may supply bundled maps; this factory owns them and
// releases shared resources once. No DOM or network work happens in the factory.
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

export function createMillMaterials({ surfaceMaps = {} } = {}) {
  const textures = new Set();

  // 1. Poured-cast iron: broad mottling plus a fine pinhole grain (bump only).
  const cast = fractal(11, [3, 6, 13]);
  const pinhole = fractal(23, [19, 37]);
  const roughness = fractal(37, [5, 11, 29]);
  const castBump = createTexture('painted-cast-bump', (u, v) => {
    const grain = (pinhole(u, v) - .5) * .5;
    return grayscale(128 + (cast(u, v) - .5) * 18 + grain * 60);
  }, { role: 'cast-bump' });
  // Enamel is a dielectric with a semi-gloss binder over fine cast relief.
  const paintRoughness = createTexture('paint-roughness', (u, v) => {
    const peel = .5 + (pinhole(u, v) - .5) * .32 + (cast(u, v) - .5) * .18;
    const value = 216 + (roughness(u, v) - .5) * 18 + (peel - .5) * 16;
    const g = clamp255(value);
    return [g, g, g, 255];
  }, { role: 'paint-roughness' });
  // A small albedo variation keeps the cast grain readable under broad light;
  // the bump still supplies its relief. There is no baked directional shading.
  const paintTone = createTexture('paint-tone', (u, v) => {
    return grayscale(246 + (pinhole(u, v) - .5) * 18 + (cast(u, v) - .5) * 3);
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
  Object.values(surfaceMaps).forEach(texture => textures.add(texture));

  const paint = (name, color) => {
    const material = new MeshPhysicalMaterial({
      color, map: paintTone, roughness: .38, metalness: 0, bumpMap: castBump, bumpScale: .008, roughnessMap: paintRoughness,
      clearcoat: .32, clearcoatRoughness: .25, envMapIntensity: 1,
    });
    material.name = name;
    material.userData = { materialRole: 'painted-cast-iron', surfaceDetail: 'cast-texture' };
    return material;
  };

  castBump.repeat.set(9, 9);
  paintRoughness.repeat.set(9, 9);
  paintTone.repeat.set(9, 9);

  const metalMaps = {
    ...(surfaceMaps.metalColor ? { map: surfaceMaps.metalColor } : {}),
    ...(surfaceMaps.metalNormal ? { normalMap: surfaceMaps.metalNormal, normalScale: new Vector2(.12, .12) } : {}),
    ...(surfaceMaps.metalRoughness ? { roughnessMap: surfaceMaps.metalRoughness } : {}),
  };
  const machined = new MeshPhysicalMaterial({
    color: '#c8cac8', roughness: .23, metalness: 1, bumpMap: machinedBump, bumpScale: .0012,
    anisotropy: .55, ...metalMaps,
  });
  machined.name = 'machined';
  machined.userData = { materialRole: 'machined-steel', surfaceDetail: 'machined-streaks' };

  const way = new MeshPhysicalMaterial({
    color: '#aeb2b1', roughness: .25, metalness: 1, bumpMap: wayBump, bumpScale: .0015,
    anisotropy: .65, ...metalMaps,
  });
  way.name = 'steel';
  way.userData = { materialRole: 'bare-steel', surfaceDetail: 'way-grind' };

  const materialSet = {
    body: paint('body', '#565c59'),
    bodyLight: paint('bodyLight', '#626864'),
    steel: way,
    dark: new MeshStandardMaterial({ color: '#202321', roughness: .36, metalness: .65 }),
    rubber: new MeshPhysicalMaterial({ color: '#141514', roughness: .36, metalness: 0, clearcoat: .28, clearcoatRoughness: .27 }),
    beltRubber: new MeshStandardMaterial({ color: '#121311', roughness: .88, metalness: 0 }),
    motorPaint: paint('motorPaint', '#363a36'),
    accent: new MeshStandardMaterial({ color: '#d2d4d1', roughness: .27, metalness: 1 }),
    machined,
    chrome: new MeshPhysicalMaterial({ color: '#e0e2e0', roughness: .115, metalness: 1, anisotropy: .28, bumpMap: machinedBump, bumpScale: .00035 }),
    aluminum: new MeshPhysicalMaterial({ color: '#d1d3d1', roughness: .19, metalness: 1, anisotropy: .4, ...metalMaps }),
    scalePlate: new MeshStandardMaterial({ color: '#d2d4d2', map: surfaceMaps.quillScale ?? null, roughness: .32, metalness: .8 }),
    fastener: new MeshStandardMaterial({ color: '#575b58', roughness: .25, metalness: 1 }),
    toolSteel: new MeshStandardMaterial({ color: '#929793', roughness: .19, metalness: 1 }),
    bronze: new MeshStandardMaterial({ color: '#b48c48', roughness: .27, metalness: 1, bumpMap: machinedBump, bumpScale: .0005 }),
    oil: new MeshPhysicalMaterial({
      name: 'oil', map: oil, transparent: true, opacity: .25, roughness: .12, metalness: 0,
      clearcoat: .9, clearcoatRoughness: .08,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: DoubleSide,
    }),
    oilRun: new MeshPhysicalMaterial({
      name: 'oilRun', map: oilRun, transparent: true, opacity: .28, roughness: .14, metalness: 0,
      clearcoat: .9, clearcoatRoughness: .08,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: DoubleSide,
    }),
  };
  materialSet.oil.userData = { materialRole: 'oil-film', surfaceDetail: 'oil-seep' };
  materialSet.oilRun.userData = { materialRole: 'oil-run', surfaceDetail: 'oil-drip' };
  materialSet.chrome.userData = { materialRole: 'chromed-steel', surfaceDetail: 'polished-reflection' };
  materialSet.aluminum.userData = { materialRole: 'polished-aluminum', surfaceDetail: 'brushed-reflection' };
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
