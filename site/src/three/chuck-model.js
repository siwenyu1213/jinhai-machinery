import {
  Box3, BufferGeometry, DataTexture, ExtrudeGeometry, Float32BufferAttribute, Group, LatheGeometry, LinearFilter, LinearMipmapLinearFilter, Matrix4, Mesh,
  MeshStandardMaterial, Path, RepeatWrapping, RGBAFormat, Shape,
  TorusGeometry, Vector2,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;
export const JAW_ANGLES = [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6];

// Deterministic microtexture: turned faces and longitudinally brushed sides.
// Geometry and surface data are local; no third-party model or HDR fetch.
function machiningTexture(radial) {
  const size = 512;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot(x - size / 2, y - size / 2);
      const noise = ((x * 73 + y * 179 + x * y * 3) % 101) / 101;
      const grain = radial
        ? Math.sin(radius * 2.15) * .52 + Math.sin(radius * .71) * .18
        : Math.sin(y * 2.9) * .48 + Math.sin(y * .57) * .20;
      const value = Math.round(179 + grain * 28 + (noise - .5) * 10);
      const index = (y * size + x) * 4;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function circleShape(radius, hole = 0) {
  const shape = new Shape();
  shape.absarc(0, 0, radius, 0, TAU, false);
  if (hole) {
    const bore = new Path();
    bore.absarc(0, 0, hole, 0, TAU, true);
    shape.holes.push(bore);
  }
  return shape;
}

function circleHole(shape, x, y, radius) {
  const hole = new Path();
  hole.absarc(x, y, radius, 0, TAU, true);
  shape.holes.push(hole);
}

function extrude(shape, depth, bevel = .018, diameter = 3.36) {
  const geometry = new ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSegments: 3,
    bevelSize: bevel, bevelThickness: bevel, curveSegments: 48, steps: 1,
  });
  // Keep the turning texture centered on the common spindle axis.
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (const group of geometry.groups) {
    if (group.materialIndex !== 0) continue;
    for (let index = group.start; index < group.start + group.count; index++) {
      uv.setXY(index, position.getX(index) / diameter + .5, position.getY(index) / diameter + .5);
    }
  }
  return geometry;
}

function rectangle(length, width) {
  const shape = new Shape();
  shape.moveTo(-length / 2, -width / 2);
  shape.lineTo(length / 2, -width / 2);
  shape.lineTo(length / 2, width / 2);
  shape.lineTo(-length / 2, width / 2);
  shape.closePath();
  return shape;
}

function mergeStaticSurfaces(part) {
  const surfaces = new Map();
  const originals = new Set();
  const inverse = part.matrixWorld.clone().invert();
  part.traverse((object) => {
    if (!object.isMesh) return;
    originals.add(object.geometry);
    const source = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry;
    const transform = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    const groups = Array.isArray(object.material)
      ? source.groups
      : [{ start: 0, count: source.attributes.position.count, materialIndex: 0 }];
    for (const group of groups) {
      const surface = Array.isArray(object.material) ? object.material[group.materialIndex] : object.material;
      const geometry = new BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = source.attributes[name];
        geometry.setAttribute(name, new Float32BufferAttribute(
          attribute.array.slice(group.start * attribute.itemSize, (group.start + group.count) * attribute.itemSize),
          attribute.itemSize,
        ));
      }
      geometry.applyMatrix4(transform);
      if (!surfaces.has(surface)) surfaces.set(surface, []);
      surfaces.get(surface).push(geometry);
    }
    if (source !== object.geometry) source.dispose();
  });
  part.clear();
  for (const [surface, geometries] of surfaces) {
    const mesh = new Mesh(mergeGeometries(geometries), surface);
    mesh.castShadow = mesh.receiveShadow = true;
    part.add(mesh);
    geometries.forEach((geometry) => geometry.dispose());
  }
  originals.forEach((geometry) => geometry.dispose());
}

export function createChuck() {
  const root = new Group();
  root.name = '三爪卡盘结构演示';
  const turnedTexture = machiningTexture(true);
  const brushedTexture = machiningTexture(false);
  const material = (color, roughness, texture, bumpScale) => new MeshStandardMaterial({
    color, metalness: 1, roughness, roughnessMap: texture,
    bumpMap: texture, bumpScale, envMapIntensity: 1.25,
  });
  const materials = {
    face: material(0xb9c2cb, .25, turnedTexture, .0012),
    polished: material(0xdce1e3, .17, turnedTexture, .0007),
    side: material(0xa3adb5, .29, brushedTexture, .0015),
    jaw: material(0x858e97, .29, brushedTexture, .001),
    scroll: material(0x9ba3ab, .26, turnedTexture, .0014),
    dark: material(0x353c43, .34, brushedTexture, .001),
  };
  const mesh = (parent, geometry, surface, x = 0, y = 0, z = 0) => {
    const part = new Mesh(geometry, surface);
    part.position.set(x, y, z);
    part.castShadow = true;
    part.receiveShadow = true;
    parent.add(part);
    return part;
  };
  const plate = (parent, shape, depth, z, surface = materials.face, bevel = .018) =>
    mesh(parent, extrude(shape, depth, bevel), [surface, materials.side], 0, 0, z);
  const ring = (parent, radius, thickness, z, surface = materials.polished, arc = TAU, rotation = 0) => {
    const item = mesh(parent, new TorusGeometry(radius, thickness, 6, Math.max(24, Math.round(100 * arc / TAU)), arc), surface, 0, 0, z);
    item.rotation.z = rotation;
    return item;
  };

  const shell = new Group();
  shell.name = '卡盘壳体';
  root.add(shell);
  const contour = [
    [1.355, -.36], [1.53, -.36], [1.63, -.32], [1.68, -.26],
    [1.68, .25], [1.655, .31], [1.60, .35], [1.355, .35], [1.355, -.36],
  ].map(([radius, depth]) => new Vector2(radius, depth));
  const shellMesh = mesh(shell, new LatheGeometry(contour, 128), materials.side);
  shellMesh.rotation.x = Math.PI / 2;
  for (const depth of [-.23, -.19, .18, .22]) ring(shell, 1.68, .009, depth, materials.dark);
  ring(shell, 1.65, .022, -.31);
  ring(shell, 1.635, .017, .31);

  // Radial square key sockets, recessed into a machined collar.
  for (const angle of JAW_ANGLES) {
    const socket = new Group();
    socket.position.set(Math.cos(angle + Math.PI / 3) * 1.67, Math.sin(angle + Math.PI / 3) * 1.67, -.015);
    socket.rotation.set(Math.PI / 2, 0, angle + Math.PI / 3 + Math.PI / 2);
    const socketFace = circleShape(.153);
    const square = new Path();
    square.moveTo(-.065, -.065); square.lineTo(-.065, .065);
    square.lineTo(.065, .065); square.lineTo(.065, -.065); square.closePath();
    socketFace.holes.push(square);
    plate(socket, socketFace, .027, -.015, materials.polished, .006);
    plate(socket, rectangle(.128, .128), .006, -.055, materials.dark, 0);
    shell.add(socket);
  }

  const rear = new Group();
  rear.name = '后盖';
  root.add(rear);
  const rearShape = circleShape(1.53, .46);
  for (const angle of JAW_ANGLES) circleHole(rearShape, Math.cos(angle) * 1.20, Math.sin(angle) * 1.20, .10);
  plate(rear, rearShape, .145, -.52);
  ring(rear, 1.44, .012, -.535);
  plate(rear, circleShape(.65, .46), .055, -.575, materials.polished);

  const scroll = new Group();
  scroll.name = '平面螺纹盘';
  root.add(scroll);
  plate(scroll, circleShape(1.31, .47), .12, -.17, materials.scroll);
  // A continuous flat spiral, rather than unrelated concentric rings.
  const spiral = new Shape();
  const turns = 5.5, samples = 660;
  for (let index = 0; index <= samples; index++) {
    const amount = index / samples, angle = amount * TAU * turns;
    const radius = .51 + amount * .74;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (!index) spiral.moveTo(x, y); else spiral.lineTo(x, y);
  }
  for (let index = samples; index >= 0; index--) {
    const amount = index / samples, angle = amount * TAU * turns;
    const radius = .545 + amount * .74;
    spiral.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  spiral.closePath();
  plate(scroll, spiral, .034, -.035, materials.polished, .004);
  ring(scroll, 1.29, .012, -.025);
  // The rear gear teeth are grouped with the spiral plate.
  const toothGeometry = extrude(rectangle(.075, .11), .045, .006);
  for (let index = 0; index < 54; index++) {
    const angle = index * TAU / 54;
    const tooth = mesh(scroll, toothGeometry, materials.dark, Math.cos(angle) * 1.18, Math.sin(angle) * 1.18, -.21);
    tooth.rotation.z = angle;
  }

  const face = new Group();
  face.name = '导向面盘';
  root.add(face);
  // Three sectors leave real open guide slots; the central bore remains open.
  for (let index = 0; index < 3; index++) {
    const start = JAW_ANGLES[index] + .165;
    const end = start + TAU / 3 - .33;
    const sector = new Shape();
    sector.absarc(0, 0, 1.605, start, end, false);
    sector.lineTo(Math.cos(end) * .465, Math.sin(end) * .465);
    sector.absarc(0, 0, .465, end, start, true);
    sector.closePath();
    const angle = (start + end) / 2;
    circleHole(sector, Math.cos(angle) * 1.24, Math.sin(angle) * 1.24, .10);
    plate(face, sector, .09, .30);
    for (const radius of [1.44, 1.49, 1.54]) ring(face, radius, .0038, .405, materials.side, end - start, start);
    // Dark socket bolt in each countersunk face hole.
    const bolt = new Group();
    bolt.position.set(Math.cos(angle) * 1.24, Math.sin(angle) * 1.24, .33);
    const head = circleShape(.083);
    const hex = new Path();
    for (let vertex = 0; vertex < 6; vertex++) {
      const theta = -vertex * TAU / 6;
      const x = Math.cos(theta) * .041, y = Math.sin(theta) * .041;
      if (!vertex) hex.moveTo(x, y); else hex.lineTo(x, y);
    }
    hex.closePath();
    head.holes.push(hex);
    plate(bolt, head, .056, 0, materials.dark, .006);
    face.add(bolt);
  }

  const jaws = JAW_ANGLES.map((angle, index) => {
    const jaw = new Group();
    jaw.name = '卡爪 ' + (index + 1);
    jaw.rotation.z = angle;
    const bodyShape = rectangle(1.13, .405);
    const base = plate(jaw, bodyShape, .18, 0, materials.jaw, .021);
    base.position.x = .17;
    for (const [x, length, z, depth] of [[.41, .65, .18, .105], [.22, .32, .285, .105], [.04, .16, .39, .10]]) {
      const step = plate(jaw, rectangle(length, .39), depth, z, materials.polished, .012);
      step.position.x = x;
    }
    // Small machined ridges across the gripping steps.
    const ridgeGeometry = extrude(rectangle(.011, .35), .008, .002);
    for (let tooth = 0; tooth < 11; tooth++) {
      const x = .105 + tooth * .051;
      const z = x < .14 ? .498 : x < .37 ? .399 : .295;
      mesh(jaw, ridgeGeometry, materials.jaw, x, 0, z);
    }
    const rackGeometry = extrude(rectangle(.025, .34), .026, .004);
    for (let tooth = 0; tooth < 12; tooth++) mesh(jaw, rackGeometry, materials.dark, -.30 + tooth * .085, 0, -.039);
    root.add(jaw);
    return jaw;
  });

  const fasteners = new Group();
  fasteners.name = '后盖紧固件';
  root.add(fasteners);
  for (const angle of JAW_ANGLES) {
    const bolt = new Group();
    bolt.position.set(Math.cos(angle) * 1.20, Math.sin(angle) * 1.20, -.54);
    plate(bolt, circleShape(.085), .062, -.075, materials.dark, .009);
    plate(bolt, circleShape(.042), .32, -.012, materials.polished, .005);
    for (let turn = 0; turn < 8; turn++) ring(bolt, .043, .0045, turn * .032, materials.side);
    fasteners.add(bolt);
  }

  const parts = { shell, rear, scroll, face, jaws, fasteners };
  function setPose(pose) {
    rear.position.z = -1.45 * pose.cover;
    scroll.position.z = .55 * pose.scroll;
    face.position.z = 1.48 * pose.cover;
    fasteners.position.z = -2.05 * pose.cover;
    jaws.forEach((jaw, index) => {
      const radius = .78 + .69 * pose.jaw;
      jaw.position.set(Math.cos(JAW_ANGLES[index]) * radius, Math.sin(JAW_ANGLES[index]) * radius, .415 + 2.45 * pose.jaw);
    });
    root.updateMatrixWorld(true);
  }
  setPose({ jaw: 0, cover: 0, scroll: 0 });
  // Keep the independently moving parts, while batching all of each part's
  // fixed teeth, grooves and fasteners by material to reduce mobile draw calls.
  for (const part of root.children) mergeStaticSurfaces(part);
  root.updateMatrixWorld(true);

  function dispose() {
    const geometries = new Set();
    root.traverse((object) => { if (object.isMesh) geometries.add(object.geometry); });
    geometries.forEach((geometry) => geometry.dispose());
    Object.values(materials).forEach((surface) => surface.dispose());
    turnedTexture.dispose();
    brushedTexture.dispose();
  }
  return { root, parts, materials, setPose, dispose, bounds: () => new Box3().setFromObject(root) };
}
