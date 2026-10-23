import { ConeGeometry, CylinderGeometry, TorusGeometry } from 'three';
import { createMachineAssembly } from './machine-tools.js';

// A generic open-bed sheet laser cutter for a visual assembly study. The bed
// spans 6.6 x 4 units at frame height; two side rails carry a gantry above the
// bed and the cutting head hangs toward -Y. No laser is ever emitted.
export function createLaser(options = {}) {
  const machine = createMachineAssembly('板材激光切割机', options);
  const { parts, mesh, block, cylinder, tube, ring, bolt, castProfile, frameBars, mergePart, part, root, finalize } = machine;
  const m = machine.materials;
  const BED_TOP = 1.62, RAIL_Y = 2.5;

  const foot = (g) => {
    block(g, [.6, .09, .5], [0, -.075, 0], m.dark, .02);
    cylinder(g, .05, .045, [0, 0, 0], m.steel, 'y', .05, 16);
  };
  part('laser-foot-fl', '前左底脚', 0, [-3.3, .12, 2.2], foot);
  part('laser-foot-fr', '前右底脚', 0, [3.3, .12, 2.2], foot);
  part('laser-foot-bl', '后左底脚', 0, [-3.3, .12, -2.2], foot);
  part('laser-foot-br', '后右底脚', 0, [3.3, .12, -2.2], foot);

  part('laser-frame', '焊接床架', 0, [0, 1.28, 0], (g) => {
    frameBars(g, [
      [[6.9, .34, .18], [0, 0, 2.3]], [[6.9, .34, .18], [0, 0, -2.3]],
      [[.18, .34, 4.6], [-3.4, 0, 0]], [[.18, .34, 4.6], [3.4, 0, 0]],
      [[.14, .12, 4.4], [0, -.16, 0]],
    ], m.body, .025);
    for (const [x, z] of [[-3.3, 2.2], [3.3, 2.2], [-3.3, -2.2], [3.3, -2.2]]) {
      block(g, [.16, 1.18, .12], [x, -.57, z], m.dark, .02);
      block(g, [.9, .2, .06], [x - Math.sign(x) * .5, -.32, z], m.body, .015);
    }
    for (const x of [-2.2, 0, 2.2]) block(g, [.04, .04, 4.3], [x, .1, 0], m.dark, .005);
  });

  const skirt = (g, width, zSign) => {
    block(g, [width, .44, .035], [0, 0, 0], m.bodyLight, .012);
    for (const dx of [-width / 3, 0, width / 3]) bolt(g, [dx, .1, zSign * .03], 'z', m.fastener, .035);
    block(g, [width * .5, .02, .04], [0, -.14, zSign * .01], m.dark, .004);
  };
  part('laser-skirt-front', '前围板', 0, [0, .95, 2.3], (g) => skirt(g, 6.5, 1));
  part('laser-skirt-rear', '后围板', 0, [0, .95, -2.3], (g) => skirt(g, 6.5, -1));
  const sideSkirt = (g) => {
    block(g, [.035, .44, 4.3], [0, 0, 0], m.bodyLight, .012);
    for (const z of [-1.5, 0, 1.5]) bolt(g, [0, .1, z], 'x', m.fastener, .035);
    block(g, [.04, .02, 2.1], [0, -.14, 0], m.dark, .004);
  };
  part('laser-skirt-left', '左侧围板', 0, [-3.4, .95, 0], sideSkirt);
  part('laser-skirt-right', '右侧围板', 0, [3.4, .95, 0], sideSkirt);

  part('laser-cross-beams', '床内横梁', 0, [0, 1.22, 0], (g) => {
    // Long rails plus a comb of floor beams left open so the bed reads hollow.
    frameBars(g, [
      [[5.2, .14, .1], [0, -.04, 1.72]], [[5.2, .14, .1], [0, -.04, -1.72]], [[5.2, .14, .1], [0, -.04, 0]],
      ...Array.from({ length: 8 }, (_, index) => [[.08, .1, 3.4], [1.4 - index * .4, -.1, 0]]),
    ], m.motorPaint, .012);
  });

  // Each sawtooth slat is one thin extruded profile, avoiding hundreds of
  // rounded boxes while keeping the actual pointed sheet supports visible.
  part('laser-slat-bed', '锯齿支撑床', 0, [0, BED_TOP, 0], (g) => {
    const profile = [[-1.95, -.2], [1.95, -.2], [1.95, -.1]];
    for (let k = 24; k >= 0; k--) {
      const z = -1.77 + k * .1475;
      profile.push([z + .06, -.1], [z, 0], [z - .06, -.1]);
    }
    profile.push([-1.95, -.1]);
    for (let index = 0; index < 12; index++) {
      const x = -3.025 + index * .55;
      const slat = castProfile(g, profile, { length: .06, axis: 'x', material: m.dark, bevel: 0 });
      slat.position.x = x;
      slat.userData.surfaceDetail = 'slat-teeth';
    }
    for (const z of [-1.92, 0, 1.92]) block(g, [6.2, .05, .06], [0, -.12, z], m.motorPaint, .008);
  });

  const rail = (g, inward) => {
    block(g, [.1, .08, 4.5], [0, 0, 0], m.steel, .012);
    block(g, [.16, .05, 4.5], [0, -.065, 0], m.dark, .008);
    for (const z of [-2, 2]) cylinder(g, .03, .04, [inward, .02, z], m.fastener, 'y', .03, 6);
  };
  part('laser-left-rail', '左直线导轨', 0, [-3.23, RAIL_Y, 0], (g) => rail(g, .02));
  part('laser-right-rail', '右直线导轨', 0, [3.23, RAIL_Y, 0], (g) => rail(g, -.02));

  const carriage = (outward) => (g) => {
    block(g, [.36, .28, .5], [outward * .04, .12, 0], m.motorPaint, .03);
    block(g, [.4, .1, .52], [outward * .02, .02, 0], m.dark, .015);
    for (const z of [-.16, .16]) {
      mesh(g, new CylinderGeometry(.07, .07, .06, 18), m.machined, [0, -.03, z], [0, 0, Math.PI / 2]).userData.surfaceDetail = 'rail-roller';
    }
    bolt(g, [outward * .04, .2, .255], 'z', m.fastener, .035);
  };
  part('laser-carriage-left', '左驱动滑座', 1, [-3.23, RAIL_Y, 0], carriage(-1));
  part('laser-carriage-right', '右驱动滑座', 1, [3.23, RAIL_Y, 0], carriage(1));

  part('laser-drive-motor', '左伺服电机', 1, [-3.23, RAIL_Y + .12, -1.45], (g) => {
    cylinder(g, .16, .42, [0, 0, 0], m.motorPaint, 'z');
    for (let k = 0; k < 12; k++) {
      const angle = k * Math.PI / 6;
      block(g, [.016, .22, .3], [Math.cos(angle) * .165, Math.sin(angle) * .165, -.02], m.motorPaint, .004).rotation.z = angle;
    }
    cylinder(g, .075, .08, [0, 0, .25], m.dark, 'z');
    block(g, [.2, .2, .12], [0, 0, -.3], m.dark, .02);
  });

  part('laser-gantry', '龙门横梁', 1, [0, RAIL_Y + .3, 0], (g) => {
    block(g, [6.9, .34, .3], [0, 0, 0], m.body, .05);
    block(g, [6.9, .04, .32], [0, .18, 0], m.bodyLight, .012);
    block(g, [6.9, .02, .02], [0, .02, -.151], m.dark, .004);
    for (const x of [-3.23, 3.23]) block(g, [.32, .36, .5], [x, .06, 0], m.dark, .025);
  });
  part('laser-beam-rail', '横梁导轨', 1, [0, RAIL_Y + .12, .13], (g) => {
    block(g, [6.1, .07, .14], [0, 0, 0], m.steel, .018);
    block(g, [6.1, .05, .1], [0, -.04, 0], m.machined, .01);
    for (const x of [-2.9, 2.9]) block(g, [.1, .14, .2], [x, .02, 0], m.dark, .015);
    for (let x = -2.7; x <= 2.71; x += .54) cylinder(g, .018, .015, [x, .04, .05], m.fastener, 'y', .018, 6);
  });
  part('laser-gantry-cable-tray', '龙门拖链托架', 1, [0, RAIL_Y + .02, -.34], (g) => {
    block(g, [6.4, .04, .18], [0, 0, 0], m.motorPaint, .008);
    for (const x of [-2.6, 0, 2.6]) block(g, [.04, .14, .16], [x, .06, 0], m.motorPaint, .006);
  });

  part('laser-z-carriage', 'Z轴头滑座', 2, [0, RAIL_Y + .6, .13], (g) => {
    block(g, [.5, .34, .34], [0, 0, 0], m.motorPaint, .03);
    block(g, [.54, .05, .38], [0, .19, 0], m.bodyLight, .012);
    cylinder(g, .035, .56, [0, -.12, -.04], m.chrome, 'y');
    cylinder(g, .07, .06, [.17, -.22, .15], m.dark, 'z');
    // Slide plate facing the cutting head, with its guide brackets.
    block(g, [.34, .3, .05], [0, -.02, -.19], m.motorPaint, .012);
    for (const x of [-.09, .09]) block(g, [.07, .16, .12], [x, -.24, -.17], m.machined, .015);
    for (const x of [-.18, .18]) bolt(g, [x, .12, .19], 'z', m.fastener, .03);
  });

  part('laser-cutting-head', '切割头', 3, [0, 2.12, .13], (g) => {
    // Z slide mounting link: a vertical tooling plate and two guide rods run up
    // from the head body into the Z carriage, so the head is carried by the
    // slide by continuous geometry rather than floating under the beam.
    block(g, [.22, .52, .06], [0, .38, .02], m.motorPaint, .012);
    for (const x of [-.09, .09]) cylinder(g, .022, .66, [x, .41, 0], m.chrome, 'y', .022, 12);
    block(g, [.24, .08, .1], [0, .14, .01], m.machined, .015);
    block(g, [.24, .32, .22], [0, 0, 0], m.dark, .025);
    block(g, [.26, .06, .24], [0, .1, 0], m.machined, .01);
    // Focus tube descends below the finger and inward toward the bed.
    cylinder(g, .07, .46, [0, -.06, 0], m.machined, 'y');
    cylinder(g, .085, .06, [0, .12, 0], m.steel, 'y');
    // Copper nozzle: a downward cone ending in an open tip.
    const nozzle = mesh(g, new ConeGeometry(.075, .14, 28, 1, true), m.bronze, [0, -.25, 0], [Math.PI, 0, 0]);
    nozzle.userData.surfaceDetail = 'copper-nozzle';
    tube(g, .045, .025, .03, [0, -.325, 0], m.bronze, 'y', 20);
    block(g, [.06, .12, .06], [.16, .02, 0], m.motorPaint, .01);
    cylinder(g, .022, .07, [-.1, .08, .12], m.bronze, 'z', .022, 12);
    for (const x of [-.06, .06]) bolt(g, [x, .13, .11], 'z', m.fastener, .022);
  });
  part('laser-hose', '切割气软管', 4, [.26, RAIL_Y + .18, .12], (g) => {
    // Coiled supply hose from the finger fitting down the side of the Z slide.
    for (let k = 0; k < 8; k++) {
      const y = .05 - k * .09;
      cylinder(g, .026, .11, [.03 * Math.sin(k * .8), y, .04 * Math.cos(k * .8)], m.rubber, 'y', .026, 10).userData.surfaceDetail = 'hose-segment';
    }
    cylinder(g, .045, .06, [0, .1, 0], m.bronze, 'y', .045, 14);
    ring(g, .06, .015, [0, -.68, 0], m.steel, 'y');
  });

  part('laser-drag-chain', 'X轴拖链', 4, [-2.6, RAIL_Y - .04, 2.28], (g) => {
    // Alternating open-link loops read as a real cable carrier.
    const links = [];
    for (let k = 0; k < 18; k++) {
      const x = k * .19;
      for (const z of [-.05, .05]) links.push([[.15, .035, .02], [x, 0, z]]);
      links.push([[.15, .02, .12], [x, .02, 0]]);
    }
    frameBars(g, links, m.motorPaint, .006).userData.surfaceDetail = 'chain-links';
    block(g, [.12, .1, .16], [-.1, 0, 0], m.dark, .01);
    block(g, [.12, .1, .16], [3.4, 0, 0], m.dark, .01);
  });

  part('laser-electrical-box', '侧电控箱', 0, [-3.3, 1.0, -1.0], (g) => {
    block(g, [.66, 1.5, .9], [0, 0, 0], m.bodyLight, .04);
    block(g, [.02, 1.3, .74], [.335, 0, 0], m.body, .01);
    for (let k = 0; k < 7; k++) block(g, [.014, .012, .5], [.35, -.35 + k * .1, 0], m.dark, .003);
    cylinder(g, .09, .03, [.34, -.45, 0], m.dark, 'x');
    mesh(g, new TorusGeometry(.07, .012, 6, 20), m.steel, [.36, -.45, 0], [0, Math.PI / 2, 0]).userData.surfaceDetail = 'fan-grille';
    block(g, [.02, .18, .12], [.34, .5, .2], m.accent, .005);
    for (const [y, z] of [[.6, .42], [-.66, .42], [.6, -.42], [-.66, -.42]]) bolt(g, [.335, y, z], 'x', m.fastener, .035);
  });

  part('laser-control-arm', '操作屏支臂', 3, [-3.0, 1.34, 1.55], (g) => {
    cylinder(g, .1, .14, [0, .02, 0], m.dark, 'y');
    cylinder(g, .05, .55, [0, .32, 0], m.chrome, 'y');
    const elbow = cylinder(g, .055, .44, [0, .6, .2], m.dark, 'z');
    elbow.rotation.x = .5;
  });
  part('laser-control-panel', '操作屏', 3, [-3.0, 2.12, 1.95], (g) => {
    block(g, [.78, .52, .09], [0, 0, 0], m.dark, .04);
    block(g, [.6, .38, .02], [0, .03, .055], m.motorPaint, .012);
    block(g, [.52, .3, .01], [0, .06, .068], m.accent, .006);
    ring(g, .05, .012, [.26, -.18, .06], m.accent, 'z');
    for (let k = 0; k < 3; k++) block(g, [.06, .025, .012], [-.2 + k * .08, -.18, .07], m.bodyLight, .004);
  });

  for (const entry of parts) mergePart(entry.object);
  const assembly = finalize('通用开放式板材激光切割机结构演示；尺寸为视觉示意，不涉及真实切割或激光发射。');
  assembly.axes = { bedTop: BED_TOP, railY: RAIL_Y };
  root.userData.axes = { bedTop: BED_TOP, railY: RAIL_Y };
  return assembly;
}
