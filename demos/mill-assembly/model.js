import {
  Box3, CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial,
  Shape, TorusGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// A generic turret knee mill, built locally for a visual assembly study.
// All dimensions are illustrative. +Z faces the operator; every moving part
// is a direct child of the identity root so its saved home pose is unambiguous.
export function createMill() {
  const root = new Group();
  root.name = '炮塔铣床装配演示';
  const parts = [];
  const geometries = new Set();
  const materials = {
    body: new MeshStandardMaterial({ color: '#77888b', roughness: .73, metalness: .08 }),
    bodyLight: new MeshStandardMaterial({ color: '#a5b0ae', roughness: .7, metalness: .06 }),
    steel: new MeshStandardMaterial({ color: '#ced4d1', roughness: .43, metalness: .24 }),
    dark: new MeshStandardMaterial({ color: '#35494f', roughness: .74, metalness: .05 }),
    rubber: new MeshStandardMaterial({ color: '#252c2e', roughness: .92, metalness: 0 }),
    accent: new MeshStandardMaterial({ color: '#deb66b', roughness: .65, metalness: .08 }),
  };

  function mesh(parent, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    geometries.add(geometry);
    const object = new Mesh(geometry, material);
    object.position.set(...position);
    object.rotation.set(...rotation);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function block(parent, size, position, material = materials.body, radius = .04) {
    const bevel = Math.min(radius, ...size.map((value) => value / 3));
    return mesh(parent, new RoundedBoxGeometry(...size, 2, bevel), material, position);
  }

  function cylinder(parent, radius, height, position, material = materials.steel, axis = 'y', bottom = radius, segments = 32) {
    const rotation = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    return mesh(parent, new CylinderGeometry(radius, bottom, height, segments), material, position, rotation);
  }

  function ring(parent, radius, tube, position, material = materials.steel, axis = 'y') {
    const rotation = axis === 'y' ? [Math.PI / 2, 0, 0] : axis === 'x' ? [0, Math.PI / 2, 0] : [0, 0, 0];
    return mesh(parent, new TorusGeometry(radius, tube, 8, 40), material, position, rotation);
  }

  function castProfile(parent, points, width, material = materials.body, bevel = .06) {
    const outline = new Shape();
    outline.moveTo(...points[0]);
    points.slice(1).forEach((point) => outline.lineTo(...point));
    outline.closePath();
    const geometry = new ExtrudeGeometry(outline, {
      depth: width, bevelEnabled: bevel > 0, bevelThickness: bevel,
      bevelSize: bevel, bevelSegments: 3, steps: 1, curveSegments: 12,
    });
    geometry.rotateY(-Math.PI / 2);
    geometry.translate(width / 2, 0, 0);
    return mesh(parent, geometry, material);
  }

  function bolt(parent, position, axis = 'y', radius = .075) {
    return cylinder(parent, radius, .075, position, materials.dark, axis, radius, 6);
  }

  function wheel(parent, radius, axis = 'z') {
    const hub = new Group();
    if (axis === 'x') hub.rotation.y = Math.PI / 2;
    if (axis === 'y') hub.rotation.x = -Math.PI / 2;
    parent.add(hub);
    ring(hub, radius, .055, [0, 0, 0], materials.dark, 'z');
    cylinder(hub, .12, .22, [0, 0, 0], materials.steel, 'z');
    for (let index = 0; index < 3; index++) {
      const spoke = block(hub, [radius, .065, .07], [radius / 2, 0, 0], materials.steel, .02);
      const angle = index * Math.PI * 2 / 3;
      spoke.position.set(Math.cos(angle) * radius / 2, Math.sin(angle) * radius / 2, 0);
      spoke.rotation.z = angle;
    }
    cylinder(hub, .07, .29, [radius * .83, 0, .17], materials.rubber, 'z');
  }

  function screw(parent, length, axis) {
    cylinder(parent, .075, length, [0, 0, 0], materials.dark, axis);
    for (let index = 0; index < 25; index++) {
      const offset = -length * .45 + length * .9 * index / 24;
      const position = axis === 'x' ? [offset, 0, 0] : axis === 'z' ? [0, 0, offset] : [0, offset, 0];
      ring(parent, .083, .018, position, materials.steel, axis);
    }
    block(parent, axis === 'x' ? [.25, .29, .29] : axis === 'z' ? [.29, .29, .25] : [.29, .25, .29], [0, 0, 0], materials.accent, .04);
  }

  function part(id, label, phase, position, build) {
    const object = new Group();
    object.name = label;
    object.position.set(...position);
    object.userData.partId = id;
    build(object);
    root.add(object);
    parts.push({ id, label, phase, object, homePosition: object.position.clone(), homeQuaternion: object.quaternion.clone() });
    return object;
  }

  part('base', '铸造底座', 0, [0, .30, -.25], (g) => {
    block(g, [2.85, .56, 3.70], [0, 0, 0], materials.body, .16);
    block(g, [2.50, .12, 3.30], [0, .28, 0], materials.bodyLight, .08);
    for (const x of [-1.10, 1.10]) for (const z of [-1.42, 1.42]) {
      cylinder(g, .16, .10, [x, -.24, z], materials.dark);
      bolt(g, [x, .37, z]);
    }
  });
  part('column', '立柱铸件', 0, [0, .67, -1.0], (g) => {
    castProfile(g, [[-.80, 0], [.78, 0], [.78, 1.05], [.52, 1.65], [.35, 4.85], [.24, 5.62], [-.62, 5.62], [-.86, 5.15]], 1.65);
    block(g, [.98, 1.45, .08], [0, 1.20, -.86], materials.dark, .07);
    for (const x of [-.68, .68]) block(g, [.13, 4.55, .12], [x, 2.90, .55], materials.steel, .025);
    block(g, [.74, .36, .06], [0, 4.84, .41], materials.dark, .025);
    block(g, [.54, .06, .025], [0, 4.84, .45], materials.accent, .01);
  });
  part('lift-screw', '升降丝杠', 0, [0, 1.63, .85], (g) => screw(g, 1.75, 'y'));
  part('knee', '升降台', 0, [0, 2.14, -.40], (g) => {
    castProfile(g, [[-.20, 0], [.55, 0], [2.02, .50], [2.18, .85], [2.18, 1.02], [-.20, 1.02]], 1.63);
    block(g, [1.85, .17, 2.35], [0, 1.06, 1.0], materials.steel, .045);
    for (const x of [-.60, .60]) block(g, [.14, .12, 2.16], [x, 1.19, .99], materials.dark, .025);
    cylinder(g, .17, .16, [.85, .62, 1.18], materials.steel, 'x');
  });

  part('y-leadscrew', 'Y轴进给丝杠', 1, [0, 3.30, 1.0], (g) => screw(g, 2.24, 'z'));
  part('saddle', '鞍座', 1, [0, 3.39, 1.15], (g) => {
    block(g, [2.10, .29, 1.70], [0, 0, 0], materials.bodyLight, .07);
    for (const z of [-.54, .54]) block(g, [2.22, .10, .14], [0, .18, z], materials.steel, .025);
    for (const x of [-.90, .90]) for (const z of [-.60, .60]) bolt(g, [x, .18, z]);
  });
  part('x-leadscrew', 'X轴进给丝杠', 1, [0, 3.61, 1.40], (g) => screw(g, 6.55, 'x'));
  part('table', 'T形槽工作台', 1, [0, 3.80, 1.40], (g) => {
    const profile = [[-.84, -.22], [.84, -.22], [.84, .18]];
    for (const center of [.52, 0, -.52]) {
      profile.push([center + .055, .18], [center + .055, .06], [center + .12, .06], [center + .12, -.055],
        [center - .12, -.055], [center - .12, .06], [center - .055, .06], [center - .055, .18]);
    }
    profile.push([-.84, .18]);
    castProfile(g, profile, 6.20, materials.steel, .012);
    block(g, [5.94, .12, .07], [0, -.08, .88], materials.dark, .02);
    for (let index = -15; index <= 15; index++) block(g, [.015, index % 5 === 0 ? .075 : .035, .018], [index * .18, -.07, .924], materials.steel, .002);
    for (const x of [-3.20, 3.20]) block(g, [.16, .37, 1.69], [x, -.03, 0], materials.bodyLight, .035);
  });
  part('table-left-bearing', '左进给轴承座', 1, [-3.35, 3.62, 1.40], (g) => cylinder(g, .19, .27, [0, 0, 0], materials.bodyLight, 'x'));
  part('table-right-bearing', '右进给轴承座', 1, [3.35, 3.62, 1.40], (g) => cylinder(g, .19, .27, [0, 0, 0], materials.bodyLight, 'x'));

  part('turret', '炮塔回转座', 2, [0, 6.47, -1.0], (g) => {
    cylinder(g, .99, .25, [0, 0, 0], materials.bodyLight);
    cylinder(g, .77, .17, [0, .18, 0], materials.body);
    for (let index = 0; index < 4; index++) bolt(g, [Math.cos(index * Math.PI / 2 + .5) * .85, .16, Math.sin(index * Math.PI / 2 + .5) * .85]);
  });
  part('ram', '水平滑枕', 2, [0, 6.88, .03], (g) => {
    block(g, [1.10, .54, 3.45], [0, 0, 0], materials.body, .10);
    for (const x of [-.51, .51]) block(g, [.06, .15, 3.18], [x, -.12, 0], materials.steel, .02);
    block(g, [1.15, .12, .18], [0, .14, -1.48], materials.dark, .025);
  });
  part('head-adapter', '铣头转接座', 2, [0, 6.66, 1.81], (g) => {
    cylinder(g, .57, .32, [0, 0, 0], materials.bodyLight, 'z');
    ring(g, .43, .025, [0, 0, .18], materials.dark, 'z');
    for (let index = 0; index < 4; index++) bolt(g, [Math.cos(index * Math.PI / 2 + .7) * .43, Math.sin(index * Math.PI / 2 + .7) * .43, .20], 'z');
  });

  part('spindle', '精加工主轴', 3, [0, 5.63, 2.12], (g) => {
    cylinder(g, .17, 1.33, [0, 0, 0]);
    cylinder(g, .24, .29, [0, -.65, 0]);
    cylinder(g, .13, .30, [0, .74, 0], materials.dark);
  });
  part('lower-bearing', '主轴下轴承组', 3, [0, 5.25, 2.12], (g) => {
    for (const y of [-.06, .06]) ring(g, .22, .055, [0, y, 0], materials.dark);
  });
  part('upper-bearing', '主轴上轴承组', 3, [0, 6.11, 2.12], (g) => ring(g, .22, .055, [0, 0, 0], materials.dark));
  part('quill', '主轴套筒', 3, [0, 5.70, 2.12], (g) => {
    const shape = new Shape();
    shape.absarc(0, 0, .29, 0, Math.PI * 2, false);
    const hole = new Shape();
    hole.absarc(0, 0, .24, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new ExtrudeGeometry(shape, { depth: 1.15, bevelEnabled: false, curveSegments: 32 });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, .575, 0);
    mesh(g, geo, materials.steel);
    for (let index = 0; index < 9; index++) block(g, [.18, .025, .06], [0, -.36 + index * .08, -.29], materials.dark, .006);
  });
  part('drawbar', '刀具拉杆', 3, [0, 6.75, 2.12], (g) => {
    cylinder(g, .06, 2.38, [0, 0, 0], materials.dark);
    cylinder(g, .12, .15, [0, 1.16, 0], materials.steel, 'y', .12, 6);
  });

  part('head-shell', '铣头主体壳', 4, [0, 5.92, 2.09], (g) => {
    castProfile(g, [[-.47, -.67], [.36, -.67], [.49, -.42], [.55, .55], [.34, .84], [-.43, .84], [-.58, .30]], 1.03, materials.bodyLight, .07);
    cylinder(g, .34, .10, [0, -.75, .04], materials.dark);
    block(g, [.50, .24, .035], [0, .17, .58], materials.dark, .025);
    block(g, [.29, .045, .018], [0, .17, .606], materials.accent, .005);
    for (const x of [-.38, .38]) for (const y of [-.43, .54]) bolt(g, [x, y, .54], 'z', .055);
  });
  part('belt-housing', '上部传动壳体', 4, [0, 7.17, 2.0], (g) => {
    block(g, [1.26, .58, 1.36], [0, 0, 0], materials.body, .13);
    cylinder(g, .46, .16, [0, -.34, .08], materials.bodyLight);
    block(g, [.75, .16, .10], [0, -.03, .70], materials.dark, .025);
  });
  part('driven-pulley', '主轴传动带轮', 4, [0, 7.51, 2.10], (g) => {
    cylinder(g, .42, .18, [0, 0, 0], materials.dark);
    cylinder(g, .36, .22, [0, .04, 0]);
  });
  part('drive-pulley', '电机传动带轮', 4, [0, 7.51, 1.25], (g) => {
    cylinder(g, .29, .19, [0, 0, 0], materials.dark);
    cylinder(g, .23, .23, [0, .02, 0]);
  });
  part('belt', '传动皮带', 4, [0, 7.51, 1.68], (g) => {
    // A closed racetrack, held as one flexible visual assembly.
    ring(g, .32, .032, [0, 0, -.40], materials.rubber);
    ring(g, .40, .032, [0, 0, .40], materials.rubber);
    for (const x of [-.355, .355]) block(g, [.055, .065, .84], [x, 0, 0], materials.rubber, .02);
  });
  part('motor', '主轴驱动电机', 4, [0, 8.07, 1.22], (g) => {
    cylinder(g, .45, 1.08, [0, 0, 0], materials.dark);
    cylinder(g, .48, .12, [0, -.52, 0], materials.bodyLight);
    cylinder(g, .42, .16, [0, .59, 0], materials.bodyLight);
    for (let index = 0; index < 16; index++) {
      const angle = index * Math.PI * 2 / 16;
      const fin = block(g, [.055, .81, .12], [Math.cos(angle) * .44, .02, Math.sin(angle) * .44], materials.bodyLight, .012);
      fin.rotation.y = -angle;
    }
    block(g, [.35, .36, .23], [.36, -.04, .35], materials.dark, .045);
  });
  part('belt-cover', '传动防护上罩', 4, [0, 7.77, 2.05], (g) => {
    block(g, [1.28, .16, 1.35], [0, 0, 0], materials.bodyLight, .065);
    for (const x of [-.48, .48]) bolt(g, [x, .10, .38], 'y', .055);
  });

  part('left-handwheel', '工作台左手轮', 5, [-3.65, 3.62, 1.40], (g) => wheel(g, .35, 'x'));
  part('right-handwheel', '工作台右手轮', 5, [3.65, 3.62, 1.40], (g) => wheel(g, .35, 'x'));
  part('cross-handwheel', '鞍座进给手轮', 5, [0, 3.30, 2.38], (g) => wheel(g, .32));
  part('lift-crank', '升降台摇柄', 5, [1.05, 2.76, .78], (g) => {
    cylinder(g, .11, .30, [0, 0, 0], materials.steel, 'x');
    block(g, [.10, .57, .10], [.14, -.22, 0], materials.steel, .035);
    cylinder(g, .07, .31, [.27, -.48, 0], materials.rubber, 'x');
  });
  part('quill-lever', '主轴套筒进给手柄', 5, [.67, 6.02, 2.09], (g) => {
    cylinder(g, .15, .30, [0, 0, 0], materials.steel, 'x');
    for (let index = 0; index < 3; index++) {
      const angle = index * Math.PI * 2 / 3 + .3;
      const arm = cylinder(g, .025, .52, [.18, Math.cos(angle) * .26, Math.sin(angle) * .26], materials.steel);
      arm.rotation.x = angle;
      cylinder(g, .075, .13, [.18, Math.cos(angle) * .55, Math.sin(angle) * .55], materials.rubber, 'x');
    }
  });
  part('fine-feed-wheel', '主轴微调手轮', 5, [-.69, 5.83, 2.09], (g) => wheel(g, .25, 'x'));
  part('collet', '刀具夹持套', 5, [0, 4.84, 2.12], (g) => {
    cylinder(g, .17, .25, [0, 0, 0], materials.dark, 'y', .12);
    for (let index = 0; index < 6; index++) {
      const angle = index * Math.PI / 3;
      block(g, [.018, .17, .035], [Math.cos(angle) * .145, -.04, Math.sin(angle) * .145], materials.steel, .003);
    }
  });
  part('endmill', '立铣刀', 5, [0, 4.51, 2.12], (g) => {
    cylinder(g, .075, .43, [0, 0, 0], materials.steel);
    for (let index = 0; index < 4; index++) {
      const blade = block(g, [.055, .21, .075], [Math.cos(index * Math.PI / 2) * .065, -.14, Math.sin(index * Math.PI / 2) * .065], materials.dark, .01);
      blade.rotation.y = index * Math.PI / 2 + .3;
    }
  });
  part('head-locks', '铣头锁紧件', 5, [0, 6.65, 2.03], (g) => {
    for (const x of [-.46, .46]) {
      cylinder(g, .07, .35, [x, -.10, 0], materials.dark, 'z');
      block(g, [.08, .30, .075], [x, -.19, .19], materials.dark, .025);
    }
  });

  root.updateMatrixWorld(true);
  root.userData.bounds = new Box3().setFromObject(root);
  root.userData.description = '通用炮塔铣床结构演示；非本厂设备复刻，非制造或维修依据。';
  let disposed = false;
  return {
    root, parts,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach((geometry) => geometry.dispose());
      Object.values(materials).forEach((material) => material.dispose());
      root.clear();
    },
  };
}
