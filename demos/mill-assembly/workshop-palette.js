// Industrial paint schemes for the joint workshop page. Only the three paint
// roles (body / bodyLight / motorPaint) are recolored by cloning the shared
// PBR materials, so maps, roughness, metalness and clearcoat stay identical to
// the original mill. Bare metals (steel, machined, chrome, bronze, fasteners)
// and the oil films are never touched. Nothing here mutates the source set.
export const WORKSHOP_PALETTES = Object.freeze({
  mill: Object.freeze({ body: '#d6d2bd', bodyLight: '#ece8dc', motorPaint: '#32534b' }),
  lathe: Object.freeze({ body: '#285f55', bodyLight: '#6d9484', motorPaint: '#183f38' }),
  laser: Object.freeze({ body: '#25343d', bodyLight: '#cf6b2e', motorPaint: '#172127' }),
});

const PAINT_KEYS = Object.freeze(['body', 'bodyLight', 'motorPaint']);

function clonePaint(source, color, name) {
  const material = source.clone();
  material.name = name;
  material.color.set(color);
  return material;
}

// Clones only the paint roles of `shared` (the mill's owned set) into a new
// dictionary. `shared` is also kept on the palette for mesh-to-role lookups.
export function createPaintPalette(machineId, shared) {
  const colors = WORKSHOP_PALETTES[machineId];
  if (!colors) throw new Error(`workshop: unknown palette ${machineId}`);
  const materials = {};
  const keys = PAINT_KEYS.filter((key) => shared[key]);
  for (const key of keys) materials[key] = clonePaint(shared[key], colors[key], `${machineId}-${key}`);
  return { id: machineId, colors, keys, materials, shared };
}

// Swaps every mesh that uses one of the palette's borrowed paint roles for the
// palette clone. Returns the borrowed -> clone pairs actually used.
export function applyPaintPalette(rootObject, palette) {
  const swapped = [];
  rootObject.traverse((object) => {
    if (!object.isMesh) return;
    for (const key of palette.keys) {
      if (object.material !== palette.shared[key]) continue;
      object.material = palette.materials[key];
      swapped.push([palette.shared[key], palette.materials[key]]);
      break;
    }
  });
  return swapped;
}
