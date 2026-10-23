import { ConeGeometry, ExtrudeGeometry, Float32BufferAttribute, PlaneGeometry, Shape, Vector3 } from 'three';
import { createMachineAssembly } from './machine-tools.js';

// A generic traditional horizontal centre lathe for a visual assembly study.
// Spindle / chuck / tailstock axis is X at (y=2.55, z=0); operator side is +Z.
// All dimensions are illustrative; no cutting process is modeled.
export function createLathe(options = {}) {
  const machine = createMachineAssembly('通用卧式车床', options);
  const { parts, mesh, block, cylinder, tube, ring, grip, bolt, screw, castProfile, handwheel, mergePart, part, root, finalize } = machine;
  const m = machine.materials;
  const AXIS_Y = 2.55, BED_TOP = 1.6, RAIL_Z = .56;

  const foot = (g) => {
    castProfile(g, [[-.93, 0], [.93, 0], [.6, .6], [.32, 1.2], [-.32, 1.2], [-.6, .6]], { length: .74, axis: 'x', material: m.body });
    block(g, [.76, .08, 1.5], [0, -.2, 0], m.dark, .03);
    for (const z of [-.6, .6]) {
      for (const x of [-.26, .26]) {
        cylinder(g, .055, .05, [x, -.22, z], m.steel, 'y', .055, 16);
        cylinder(g, .02, .1, [x, -.27, z], m.fastener, 'y', .02, 8);
      }
      bolt(g, [0, -.28, z], 'y', m.fastener, .05);
    }
    block(g, [.36, .04, 1.3], [0, 1.02, 0], m.steel, .01);
  };

  part('lathe-cabinet', '主轴箱底座', 0, [0, .7, 0], (g) => {
    block(g, [1.3, 1.4, 1.5], [0, 0, 0], m.body, .1);
    block(g, [1.34, .14, 1.54], [0, .7, 0], m.bodyLight, .03);
    block(g, [1.62, .1, .12], [0, -.62, 0], m.motorPaint, .02);
    for (let k = 0; k < 3; k++) {
      const vent = block(g, [.22, .4, .02], [0, .2 + k * .14, .755], m.bodyLight, .01);
      vent.rotation.z = .5;
    }
    cylinder(g, .06, .3, [.34, .22, .77], m.chrome, 'y');
    grip(g, .06, .18, [.34, .44, .77], 'y', m.rubber);
    bolt(g, [-.5, .3, .76], 'z', m.fastener, .05);
  });

  part('lathe-left-foot', '左床脚', 0, [3.6, .32, 0], foot);
  part('lathe-right-foot', '右床脚', 0, [-3.6, .32, 0], foot);

  part('lathe-chip-tray', '托屑盘', 0, [0, 1.08, 0], (g) => {
    block(g, [7.2, .05, 1.5], [0, 0, 0], m.motorPaint, .02);
    block(g, [7.2, .17, .05], [0, .09, .73], m.motorPaint, .015);
    const back = block(g, [7.2, .3, .05], [0, .15, -.73], m.motorPaint, .015);
    back.rotation.x = .32;
  });

  part('lathe-bed', '床身', 0, [0, 1.32, 0], (g) => {
    castProfile(g, [[-.82, -.2], [.82, -.2], [.72, 0], [.72, .28], [-.72, .28], [-.72, 0]], { length: 7.0, axis: 'x', material: m.body });
    for (const z of [-RAIL_Z, RAIL_Z]) {
      block(g, [6.9, .07, .17], [0, .27, z], m.bodyLight, .015);
      block(g, [6.9, .012, .025], [0, .31, z], m.dark, .004);
    }
  });

  const rail = (g) => {
    block(g, [6.7, .075, .13], [0, 0, 0], m.steel, .022);
    for (const x of [-3.3, 3.3]) block(g, [.12, .05, .17], [x, -.02, 0], m.dark, .01);
  };
  part('lathe-front-rail', '前导轨', 0, [0, BED_TOP, RAIL_Z], rail);
  part('lathe-rear-rail', '后导轨', 0, [0, BED_TOP, -RAIL_Z], rail);

  part('lathe-headstock', '主轴箱', 0, [4.12, 2.3, 0], (g) => {
    castProfile(g, [[-.63, -1.67], [.63, -1.67], [.63, .44], [.45, .6], [-.45, .6], [-.63, .44]], { length: 1.1, axis: 'x', material: m.body });
    block(g, [1.12, .04, .9], [0, .62, 0], m.bodyLight, .02);
    // Front cover with a parting seam and countersunk screws.
    block(g, [.02, .8, .72], [0, -.05, .562], m.bodyLight, .01);
    block(g, [.026, .012, .72], [0, .35, .575], m.dark, .003);
    for (const [y, z] of [[-.38, -.28], [.27, -.28], [-.38, .28], [.27, .28]]) {
      cylinder(g, .02, .04, [0, y, .58], m.fastener, 'z', .02, 6);
    }
    // Speed-change levers and their selector plate.
    cylinder(g, .17, .06, [-.25, .67, .2], m.dark, 'y');
    cylinder(g, .03, .34, [-.25, .82, .2], m.chrome);
    grip(g, .055, .18, [-.25, 1.03, .2], 'y', m.rubber);
    cylinder(g, .14, .05, [.25, .67, -.1], m.dark, 'y');
    cylinder(g, .03, .28, [.25, .8, -.1], m.chrome);
    grip(g, .05, .16, [.25, .98, -.1], 'y', m.rubber);
    block(g, [.44, .03, .22], [0, .645, -.1], m.dark, .01);
    tube(g, .56, .3, .08, [-.6, .25, 0], m.bodyLight, 'x', 48);
    cylinder(g, .1, .06, [.3, .66, .24], m.chrome, 'y');
    cylinder(g, .04, .02, [-.4, .66, -.2], m.bronze, 'y', .04, 16);
  });

  part('lathe-feed-gearbox', '进给箱', 0, [4.12, 1.34, 0], (g) => {
    block(g, [1.14, .5, 1.3], [0, 0, 0], m.body, .06);
    for (const x of [-.3, 0, .3]) {
      cylinder(g, .09, .05, [x, .02, .66], m.dark, 'z');
      cylinder(g, .022, .12, [x, .02, .72], m.chrome, 'z');
      grip(g, .04, .1, [x, .02, .79], 'z', m.rubber);
    }
    block(g, [.5, .16, .01], [0, -.14, .655], m.accent, .004);
    for (const x of [-.45, .45]) bolt(g, [x, .12, .655], 'z', m.fastener, .04);
  });

  part('lathe-control-levers', '控制杆', 0, [3.38, 2.0, .66], (g) => {
    cylinder(g, .13, .2, [0, 0, 0], m.dark, 'z');
    ring(g, .1, .018, [0, 0, .1], m.chrome, 'z');
    const arm = block(g, [.09, .38, .06], [0, 0, 0], m.chrome, .025);
    arm.position.set(-.07, -.19, .11);
    arm.rotation.z = .35;
    grip(g, .055, .16, [-.12, -.38, .12], 'z', m.rubber);
    cylinder(g, .035, .18, [.06, .06, .14], m.chrome, 'z');
    // Safety brake bar along the front of the bed, on two brackets.
    cylinder(g, .03, 5.6, [-3.38, -.9, .35], m.chrome, 'x');
    for (const x of [-6.0, -.76]) block(g, [.06, .5, .05], [x, -.65, .35], m.dark, .015);
    grip(g, .07, .3, [-.78, -.9, .35], 'x', m.rubber);
  });

  part('lathe-spindle', '主轴', 0, [3.43, AXIS_Y, 0], (g) => {
    cylinder(g, .31, 1.85, [0, 0, 0], m.machined, 'x');
    ring(g, .43, .05, [.86, 0, 0], m.machined, 'x');
    cylinder(g, .33, .14, [-.8, 0, 0], m.dark, 'x');
  });

  part('lathe-chuck', '三爪卡盘', 1, [2.38, AXIS_Y, 0], (g) => {
    tube(g, .84, .27, .44, [0, 0, 0], m.dark, 'x', 56);
    tube(g, .56, .27, .1, [.27, 0, 0], m.machined, 'x', 48);
    ring(g, .6, .035, [.22, 0, 0], m.bronze, 'x');
    ring(g, .8, .03, [-.225, 0, 0], m.machined, 'x');
    for (let k = 0; k < 3; k++) {
      const angle = k * Math.PI * 2 / 3 + Math.PI / 6;
      block(g, [.05, .12, .12], [-.235, Math.sin(angle) * .58, Math.cos(angle) * .58], m.dark, .01).rotation.x = -angle;
      const slot = block(g, [.05, .05, .06], [-.23, Math.sin(angle) * .77, Math.cos(angle) * .77], m.machined, .005);
      slot.rotation.x = -angle;
    }
  });

  // Three stepped jaws in a local frame: jaw base at the origin, stacking
  // toward the spindle axis and stepping in. Each slides along the X chuck face.
  const placeJaw = (jaw, angle) => {
    jaw.position.set(2.06, AXIS_Y + Math.sin(angle) * .45, Math.cos(angle) * .45);
    const radial = new Vector3(0, Math.sin(angle), Math.cos(angle));
    jaw.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), radial.clone().negate());
  };
  for (let index = 0; index < 3; index++) {
    const jaw = part(`lathe-jaw-${index + 1}`, `台阶卡爪${index + 1}`, 2, [2.06, 0, 0], (g) => {
      block(g, [.26, .1, .16], [0, .04, -.04], m.machined, .01);
      block(g, [.26, .06, .12], [0, .12, -.06], m.machined, .008);
      block(g, [.26, .05, .08], [0, .175, -.08], m.machined, .006);
      for (const y of [.09, .15]) block(g, [.27, .006, .17], [0, y, -.05], m.dark, .001);
    });
    placeJaw(jaw, index * Math.PI * 2 / 3 + Math.PI / 6);
    // placeJaw moves the part group radially; record that as its home pose.
    parts[parts.length - 1].setHomePosition(jaw.position.x, jaw.position.y, jaw.position.z);
    parts[parts.length - 1].setHomeQuaternion();
  }

  part('lathe-leadscrew', '进给丝杠', 0, [0, 1.33, .88], (g) => {
    screw(g, 6.5, .07, m.machined, m.chrome, 'x', 40);
    for (const x of [-3.16, 3.16]) cylinder(g, .1, .14, [x, 0, 0], m.dark, 'x');
  });
  part('lathe-feed-rod', '光杠', 0, [0, 1.62, .88], (g) => {
    cylinder(g, .06, 6.6, [0, 0, 0], m.chrome, 'x');
    for (const x of [-3.2, 3.2]) cylinder(g, .09, .1, [x, 0, 0], m.dark, 'x');
  });

  part('lathe-saddle', '溜板', 1, [0, 1.72, 0], (g) => {
    block(g, [1.5, .2, .92], [0, 0, 0], m.body, .04);
    for (const z of [.65, -.65]) block(g, [1.7, .26, .05], [0, -.06, z], m.bodyLight, .012);
    block(g, [1.42, .015, .9], [0, .1, 0], m.steel, .004);
    for (const x of [-.55, .55]) bolt(g, [x, .11, .34], 'y', m.fastener, .04);
  });

  part('lathe-apron', '溜板箱', 1, [0, 1.33, .38], (g) => {
    block(g, [1.12, .62, .22], [0, 0, 0], m.bodyLight, .03);
    block(g, [1.06, .03, .01], [0, .18, .115], m.dark, .004);
    cylinder(g, .07, .12, [.38, .1, .14], m.dark, 'z');
    cylinder(g, .025, .26, [.32, -.1, .15], m.chrome);
    grip(g, .045, .1, [.32, -.24, .15], 'z', m.rubber);
    for (const x of [-.32, -.12]) {
      cylinder(g, .06, .08, [x, -.08, .13], m.dark, 'z');
      grip(g, .04, .09, [x, -.08, .19], 'z', m.rubber);
    }
    cylinder(g, .04, .02, [-.4, .08, .112], m.bronze, 'z', .04, 12);
    for (const x of [-.48, .48]) bolt(g, [x, .24, .115], 'z', m.fastener, .035);
  });

  part('lathe-apron-handwheel', '溜板箱手轮', 2, [0, 1.33, .62], (g) => handwheel(g, .27, m));
  part('lathe-saddle-handwheel', '横向进给手轮', 2, [0, 1.85, .78], (g) => {
    handwheel(g, .25, m);
    cylinder(g, .03, .3, [0, 0, -.15], m.chrome, 'z');
    cylinder(g, .06, .06, [0, 0, .02], m.machined, 'z');
  });

  part('lathe-cross-slide', '横滑板', 2, [0, 1.95, .18], (g) => {
    block(g, [.85, .18, .58], [0, 0, 0], m.body, .03);
    block(g, [.86, .012, .56], [0, .1, 0], m.machined, .004);
    block(g, [.2, .08, .1], [.3, .04, .24], m.dark, .015);
  });
  part('lathe-compound', '小滑板', 3, [0, 2.1, .28], (g) => {
    block(g, [.56, .14, .6], [0, 0, 0], m.bodyLight, .025);
    block(g, [.58, .012, .6], [0, .07, 0], m.machined, .004);
    ring(g, .17, .02, [0, .06, -.12], m.dark, 'y');
    for (let k = 0; k < 6; k++) cylinder(g, .008, .012, [Math.cos(k) * .17, .075, -.12 + Math.sin(k) * .17], m.dark, 'y', .008, 6);
  });
  part('lathe-tool-post', '方刀架', 3, [0, 2.2, .18], (g) => {
    cylinder(g, .19, .16, [0, .06, 0], m.bodyLight, 'y');
    block(g, [.5, .22, .5], [0, .24, 0], m.dark, .025);
    for (let k = 0; k < 4; k++) {
      const angle = k * Math.PI / 2 + Math.PI / 4;
      const seat = block(g, [.34, .04, .16], [Math.cos(angle) * .13, .37, Math.sin(angle) * .13], m.dark, .012);
      seat.rotation.y = -angle;
    }
    cylinder(g, .014, .02, [0, .37, 0], m.bronze, 'y', .014, 10);
    cylinder(g, .035, .22, [-.3, .24, 0], m.chrome, 'y');
    grip(g, .05, .12, [-.3, .38, 0], 'y', m.rubber);
  });
  part('lathe-tool-holder', '刀杆', 3, [0, 2.47, -.02], (g) => {
    block(g, [.16, .14, .95], [0, 0, 0], m.toolSteel, .012);
    block(g, [.12, .1, .24], [0, -.02, -.6], m.machined, .01);
    bolt(g, [0, .075, .2], 'y', m.fastener, .035);
    bolt(g, [0, .075, .35], 'y', m.fastener, .035);
  });

  part('lathe-tailstock-base', '尾座底座', 0, [-2.055, 1.81, 0], (g) => {
    block(g, [.93, .2, .8], [0, 0, 0], m.body, .03);
    for (const z of [.5, -.5]) block(g, [.24, .16, .05], [0, -.03, z], m.bodyLight, .01);
    block(g, [.5, .03, .34], [0, .1, 0], m.steel, .004);
  });
  part('lathe-tailstock-body', '尾座体', 0, [-2.055, 2.35, 0], (g) => {
    // One-piece cast body profile in the Y-Z plane, extruded along the spindle
    // axis (local X). The spindle bore is cut through the profile as a real
    // hole so the quill passes through open casting, never a capped box.
    const bore = .115;
    const outline = new Shape();
    outline.moveTo(-.4, -.35);
    outline.lineTo(.32, -.35);
    outline.lineTo(.37, -.27);
    outline.lineTo(.37, .24);
    outline.lineTo(.24, .35);
    outline.lineTo(-.2, .35);
    outline.lineTo(-.4, .2);
    outline.closePath();
    const hole = new Shape();
    // The casting origin is .2 below the spindle axis.
    hole.absarc(0, .2, bore, 0, Math.PI * 2, true);
    outline.holes.push(hole);
    const thickness = .78;
    const casting = new ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false, curveSegments: 40 });
    casting.translate(0, 0, -thickness / 2);
    casting.rotateY(Math.PI / 2);
    casting.deleteAttribute('uv');
    casting.computeVertexNormals();
    const position = casting.getAttribute('position');
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      uv[i * 2] = position.getZ(i) * .8;
      uv[i * 2 + 1] = position.getY(i) * .8;
    }
    casting.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    mesh(g, casting, m.body);
    // Bore liner flange on both faces, clear of the quill.
    tube(g, .17, bore, .03, [.4, .2, 0], m.dark, 'x', 40);
    tube(g, .17, bore, .03, [-.4, .2, 0], m.dark, 'x', 40);
    // Quill clamp lever on top of the casting.
    cylinder(g, .025, .22, [0, .45, 0], m.chrome, 'y');
    grip(g, .05, .14, [0, .59, 0], 'y', m.rubber);
    // Feed screw boss on the tail stock face.
    block(g, [.14, .16, .16], [.36, -.15, 0], m.body, .02);
    mergePart(g);
  });
  part('lathe-tailstock-quill', '尾座套筒', 1, [-2.0, AXIS_Y, 0], (g) => {
    cylinder(g, .105, .72, [0, 0, 0], m.chrome, 'x');
    ring(g, .14, .02, [.33, 0, 0], m.machined, 'x');
    for (let k = 0; k < 12; k++) cylinder(g, .007, .01, [.18 + k * .012, .106, 0], m.dark, 'y', .007, 6);
  });
  part('lathe-tailstock-center', '顶尖', 1, [-1.72, AXIS_Y, 0], (g) => {
    cylinder(g, .075, .22, [0, 0, 0], m.machined, 'x');
    mesh(g, new ConeGeometry(.062, .14, 24), m.machined, [0, 0, 0], [0, 0, -Math.PI / 2]);
    ring(g, .086, .016, [-.11, 0, 0], m.chrome, 'x');
  });
  part('lathe-tailstock-handwheel', '尾座手轮', 2, [-2.98, AXIS_Y, 0], (g) => {
    const wheel = handwheel(g, .26, m);
    wheel.rotation.y = -Math.PI / 2;
    cylinder(g, .045, .65, [.3, 0, 0], m.chrome, 'x');
  });

  // Light spindle nose guard only; it never covers the chuck or tailstock.
  part('lathe-chuck-guard', '卡盘防护', 4, [3.25, 3.42, .1], (g) => {
    mesh(g, new PlaneGeometry(.9, .7), m.bodyLight, [0, 0, 0], [Math.PI / 2, 0, .12]);
    block(g, [.5, .09, .09], [.2, -.12, .12], m.dark, .02);
    for (const x of [-.3, .3]) block(g, [.05, .36, .05], [x, -.2, -.25], m.dark, .012);
  });

  // Reduce draw calls: each assembly part keeps its own transform and material
  // split, but same-material sub-meshes (bolts, collars, graduations) combine.
  for (const entry of parts) mergePart(entry.object);

  const assembly = finalize('通用传统卧式车床结构演示；尺寸为视觉示意，不代表任何品牌、型号或精度。');
  assembly.axes = { spindle: new Vector3(0, AXIS_Y, 0), spindleY: AXIS_Y, bedTop: BED_TOP, railZ: RAIL_Z };
  root.userData.axes = { spindleY: AXIS_Y, bedTop: BED_TOP };
  return assembly;
}
