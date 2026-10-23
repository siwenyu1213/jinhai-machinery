import {
  Box3, BufferAttribute, BufferGeometry, CapsuleGeometry, CylinderGeometry, Euler, ExtrudeGeometry, Float32BufferAttribute,
  Group, Mesh, Matrix4, MeshStandardMaterial, Shape, TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMillMaterials } from './materials.js';

// Shared building blocks for the added traditional machines. Dimensions are in
// the same visual units as the mill and are illustrative only. Every helper
// registers geometry with the assembly so ownership and disposal stay in one
// place; borrowed material sets are never disposed here.

const AXES = {
  x: [0, 0, Math.PI / 2],
  y: [0, 0, 0],
  z: [Math.PI / 2, 0, 0],
};

export function createMachineAssembly(name, options = {}, defaults = {}) {
  const borrowed = options.materials ?? null;
  const owned = borrowed ? null : createMillMaterials(options);
  const root = new Group();
  root.name = name;
  const parts = [];
  const geometries = new Set();
  const ownedMaterials = new Set();

  function paint(material) {
    // Factory materials are released by owned.dispose(); only independent
    // fallback materials belong in ownedMaterials.
    return material;
  }

  // Fills missing dictionary entries with locally owned stand-ins. Own (mill)
  // dictionaries may be extended, but a borrowed dictionary is never written:
  // missing roles resolve to a single local stand-in that is disposed with this
  // assembly, so the borrower cannot destroy a host machine's materials.
  const allowLocalStandIn = !borrowed || defaults.allowStandIn === true;
  let standIn = null;
  function standInMaterial() {
    if (!standIn) {
      standIn = new MeshStandardMaterial({ color: '#4a4d4a', roughness: .8, metalness: .2 });
      standIn.name = `${name}-stand-in`;
      ownedMaterials.add(standIn);
    }
    return standIn;
  }
  function materialDictionary() {
    const base = borrowed ?? owned.materials;
    return new Proxy(Object.create(null), {
      get(target, key) {
        if (typeof key !== 'string') return Reflect.get(base, key);
        if (base[key]) return base[key];
        const material = borrowed
          ? (allowLocalStandIn ? standInMaterial() : borrowed.body)
          : (owned.materials[key] = new MeshStandardMaterial({ color: '#4a4d4a', roughness: .8, metalness: .2 }));
        target[key] = material;
        return material;
      },
    });
  }

  function mesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    geometries.add(geometry);
    const object = new Mesh(geometry, paint(material));
    object.position.set(...position);
    object.rotation.set(...rotation);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function block(parent, size, position, material, radius = .04) {
    const bevel = Math.min(radius, ...size.map((value) => value / 3));
    const segments = bevel > .09 ? 4 : 2;
    return mesh(parent, new RoundedBoxGeometry(...size, segments, Math.max(0, bevel)), material, position);
  }

  function cylinder(parent, radius, height, position, material, axis = 'y', bottom = radius, segments = 32) {
    return mesh(parent, new CylinderGeometry(radius, bottom, height, segments), material, position, AXES[axis]);
  }

  // Closed tube (ring) along an axis: used for bores, collars and sleeves.
  function tube(parent, outer, inner, length, position, material, axis = 'y', segments = 40) {
    const outline = new Shape();
    outline.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new Shape();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    outline.holes.push(hole);
    const geometry = new ExtrudeGeometry(outline, { depth: length, bevelEnabled: false, curveSegments: segments });
    geometry.translate(0, 0, -length / 2);
    if (axis === 'x') geometry.rotateY(Math.PI / 2);
    else if (axis === 'y') geometry.rotateX(Math.PI / 2);
    geometry.computeVertexNormals();
    return mesh(parent, geometry, material, position);
  }

  function ring(parent, radius, thickness, position, material, axis = 'y') {
    const rotation = axis === 'y' ? [Math.PI / 2, 0, 0] : axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0];
    return mesh(parent, new TorusGeometry(radius, thickness, 10, 40), material, position, rotation);
  }

  function grip(parent, radius, length, position, axis = 'z', material) {
    return mesh(parent, new CapsuleGeometry(radius, Math.max(0, length - 2 * radius), 4, 12), material, position, AXES[axis]);
  }

  function bolt(parent, position, axis, material, radius = .055) {
    const head = cylinder(parent, radius, radius * 1.1, position, material, axis, radius, 6);
    head.userData.surfaceDetail = 'bolt-head';
    return head;
  }

  function screw(parent, length, radius, material, threadMaterial, axis = 'x', turns = 22) {
    cylinder(parent, radius, length, [0, 0, 0], material, axis, radius, 20);
    const steps = turns * 24;
    const profile = [[-.4, radius * .95], [-.18, radius * 1.3], [.18, radius * 1.3], [.4, radius * .95]];
    const vertices = [], uv = [], indices = [];
    for (let row = 0; row <= steps; row++) {
      const t = row / steps, angle = t * turns * Math.PI * 2;
      for (let side = 0; side < 4; side++) {
        const [offset, scaled] = profile[side];
        vertices.push(Math.sin(angle) * scaled, (t - .5) * length + offset * length / turns, Math.cos(angle) * scaled);
        uv.push(t * turns, side / 3);
        if (row < steps && side < 3) {
          const a = row * 4 + side, b = a + 4;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const thread = new BufferGeometry();
    thread.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    thread.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    thread.setIndex(indices);
    thread.computeVertexNormals();
    if (axis === 'x') thread.rotateZ(Math.PI / 2);
    else if (axis === 'z') thread.rotateX(Math.PI / 2);
    mesh(parent, thread, threadMaterial).userData.surfaceDetail = 'continuous-lead-thread';
  }

  // Box-free planar UVs from world-space X/Z extents, so procedural textures on
  // extruded profiles read as consistent sheet grain instead of degenerate UVs.
  function planarUv(geometry, scale) {
    const position = geometry.getAttribute('position');
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      uv[i * 2] = position.getX(i) * scale;
      uv[i * 2 + 1] = position.getZ(i) * scale;
    }
    geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    return geometry;
  }

  // Every merge input is uniformised: indexed, position/normal/uv only, same
  // item sizes. Indexed inputs keep their index (and winding); non-indexed ones
  // are re-indexed in place order, which preserves triangles and UVs.
  function mergeCompatible(geometries) {
    const list = geometries.map((geometry) => {
      const copy = geometry.clone();
      for (const key of Object.keys(copy.attributes)) {
        if (key !== 'position' && key !== 'normal' && key !== 'uv') copy.deleteAttribute(key);
      }
      if (!copy.index) {
        const count = copy.getAttribute('position').count;
        const index = count > 65535 ? new Uint32Array(count) : new Uint16Array(count);
        for (let i = 0; i < count; i++) index[i] = i;
        copy.setIndex(new BufferAttribute(index, 1));
      }
      if (!copy.getAttribute('normal')) copy.computeVertexNormals();
      if (!copy.getAttribute('uv')) {
        copy.setAttribute('uv', new Float32BufferAttribute(new Float32Array(copy.getAttribute('position').count * 2), 2));
      }
      return copy;
    });
    const merged = mergeGeometries(list);
    list.forEach((geometry) => geometry.dispose());
    return merged;
  }

  // Extruded cast-iron profile. Profile points are read as (right, up) in the
  // local front view of the part and mapped onto the two axes perpendicular to
  // the extrusion axis, so the same profile stays upright for x, y and z.
  function castProfile(parent, points, options2) {
    const { length, axis = 'x', material, bevel = .05 } = options2;
    const outline = new Shape();
    outline.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach((point) => outline.lineTo(point[0], point[1]));
    outline.closePath();
    // Extrude runs along the profile's local +Z (depth). Map it onto the
    // requested extrusion axis while keeping the profile's +Y upright:
    // x -> depth onto +X, z/y -> depth onto +Y (profile lies on the floor).
    const geometry = new ExtrudeGeometry(outline, {
      depth: length, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
      bevelSegments: 3, steps: 1, curveSegments: 12,
    });
    geometry.translate(0, 0, -length / 2);
    // x: depth +Z -> +X; y: depth +Z -> +Y (profile stays upright); z: unchanged.
    const rotation = axis === 'x' ? [0, -Math.PI / 2, 0] : axis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...rotation)));
    // ExtrudeGeometry emits per-triangle UVs; rebuild them from positions so the
    // surface is textured rather than degenerate.
    geometry.deleteAttribute('uv');
    geometry.computeVertexNormals();
    planarUv(geometry, .5);
    // toCreasedNormals hands back a fresh non-indexed geometry with recomputed
    // normals (which keeps the planar UVs); the pre-crease geometry is retired.
    let finalGeometry = geometry;
    if (material?.userData?.materialRole === 'painted-cast-iron') {
      finalGeometry = toCreasedNormals(geometry, Math.PI / 3);
      if (finalGeometry !== geometry) geometry.dispose();
    }
    return mesh(parent, finalGeometry, material);
  }

  // Thin open frame: merged rectangular bars sharing one material.
  function frameBars(parent, bars, material, radius = .02) {
    const list = bars.map(([size, position]) => {
      const bevel = Math.min(radius, ...size.map((value) => value / 3));
      const geometry = new RoundedBoxGeometry(...size, 2, Math.max(.002, bevel));
      geometry.translate(...position);
      return geometry;
    });
    const merged = mergeCompatible(list);
    list.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error('frameBars: incompatible bar geometries');
    const object = mesh(parent, merged, material);
    object.userData.surfaceDetail = 'merged-frame-bars';
    return object;
  }

  // Merges every mesh of one component group that shares a material into one
  // mesh per material: geometries keep their baked local matrices, retired
  // source geometries are disposed, and material/UV/normals stay untouched.
  function mergePart(group) {
    const byMaterial = new Map();
    for (const child of group.children) {
      if (!child.isMesh) continue;
      if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
      byMaterial.get(child.material).push(child);
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const list = meshes.map((object) => {
        object.updateMatrix();
        return object.geometry.clone().applyMatrix4(object.matrix);
      });
      const merged = mergeCompatible(list);
      list.forEach((geometry) => geometry.dispose());
      if (!merged) throw new Error(`mergePart(${group.name}): incompatible sub-meshes`);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const detail = meshes.map((object) => object.userData.surfaceDetail).filter(Boolean);
      const userData = { mergedMeshes: meshes.length };
      if (detail.length) userData.surfaceDetail = detail.length > 1 ? 'merged-details' : detail[0];
      for (const object of meshes) {
        geometries.delete(object.geometry);
        object.geometry.dispose();
        group.remove(object);
      }
      mesh(group, merged, material).userData = userData;
    }
  }

  // A handwheel with rim, three spokes and a black grip, in a local X-Z plane
  // facing +Z, so it can be rotated onto the operator side.
  function handwheel(parent, radius, materials) {
    const hub = new Group();
    parent.add(hub);
    ring(hub, radius, .045, [0, 0, 0], materials.chrome, 'z');
    cylinder(hub, .1, .14, [0, 0, 0], materials.chrome, 'z');
    for (let index = 0; index < 3; index++) {
      const angle = index * Math.PI * 2 / 3;
      const spoke = block(hub, [radius, .045, .055], [0, 0, 0], materials.chrome, .018);
      spoke.position.set(Math.cos(angle) * radius / 2, Math.sin(angle) * radius / 2, 0);
      spoke.rotation.z = angle;
    }
    // Grip sits on the rim of the wheel and points out toward the operator.
    grip(hub, .06, .26, [radius, 0, .15], 'z', materials.rubber);
    return hub;
  }

  function part(id, label, phase, position, build) {
    const object = new Group();
    object.name = id;
    object.position.set(...position);
    object.userData.partId = id;
    object.userData.machineId = name;
    build(object);
    root.add(object);
    parts.push({
      id, label, phase, object,
      homePosition: object.position.clone(), homeQuaternion: object.quaternion.clone(),
      // A build callback may nudge its own part group (e.g. step jaws onto the
      // spindle centre); after build runs, sync or explicitly reset those.
      setHomePosition(x, y, z) {
        object.position.set(x, y, z);
        this.homePosition.copy(object.position);
      },
      setHomeQuaternion() {
        this.homeQuaternion.copy(object.quaternion);
      },
    });
    return object;
  }

  function finalize(description) {
    let meshes = 0;
    root.traverse((object) => { if (object.isMesh) meshes++; });
    root.userData.meshes = meshes;
    root.userData.description = description;
    root.updateMatrixWorld(true);
    root.userData.homeBounds = new Box3().setFromObject(root);
    let disposed = false;
    return {
      root, parts,
      materials: borrowed ?? owned.materials,
      textures: borrowed ? new Set(Object.values(options.surfaceMaps ?? {})) : owned.textures,
      // Live registry size, not the size captured at finalize time.
      get geometryCount() { return geometries.size; },
      get materialCount() { return ownedMaterials.size; },
      get disposed() { return disposed; },
      dispose() {
        if (disposed) return;
        disposed = true;
        geometries.forEach((geometry) => geometry.dispose());
        geometries.clear();
        if (owned) owned.dispose();
        ownedMaterials.forEach((material) => material.dispose());
        ownedMaterials.clear();
        root.clear();
      },
    };
  }

  return { root, parts, materials: materialDictionary(), mesh, block, cylinder, tube, ring, grip, bolt, screw, castProfile, frameBars, handwheel, mergePart, part, finalize };
}
