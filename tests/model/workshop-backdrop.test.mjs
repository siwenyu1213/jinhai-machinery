import assert from 'node:assert/strict';
import test from 'node:test';
import { BACKDROP_MODES, mapBackdropState } from '../../demos/mill-assembly/workshop-backdrop.js';

test('three distinct backdrop choices are immutable and retain their Chinese names', () => {
  assert.deepEqual(BACKDROP_MODES.map(({ id }) => id), ['studio', 'airflow', 'blueprint']);
  assert.deepEqual(BACKDROP_MODES.map(({ label }) => label), ['工业摄影棚', '旋转气流', '工程图纸']);
  assert.ok(Object.isFrozen(BACKDROP_MODES));
  BACKDROP_MODES.forEach(mode => assert.ok(Object.isFrozen(mode)));
});

test('backdrop scroll mapping is reversible, continuous and independent of frame history', () => {
  const samples = Array.from({ length: 95 }, (_, i) => i / 100);
  const first = samples.map(progress => mapBackdropState({ progress }));
  const reverse = samples.toReversed().map(progress => mapBackdropState({ progress })).toReversed();
  assert.deepEqual(first, reverse);
  for (let i = 1; i < first.length; i++) {
    assert.ok(first[i].turn >= first[i - 1].turn);
    assert.ok(first[i].turn - first[i - 1].turn < 8);
    assert.ok(Math.abs(first[i].radius - first[i - 1].radius) < .025);
    assert.ok(Math.abs(first[i].activity - first[i - 1].activity) < .03);
  }
  assert.equal(first[0].turn, 0);
  assert.equal(first.at(-1).turn, 360);
  assert.equal(first.at(-1).floor, 1);
});

test('the funnel shrinks and completion settles the background without restarting its rotation', () => {
  const early = mapBackdropState({ progress: .12 });
  const settled = mapBackdropState({ progress: .64 });
  const final = mapBackdropState({ progress: .94, complete: true });
  assert.ok(early.radius > settled.radius);
  assert.equal(final.radius, .8);
  assert.equal(final.activity, .12);
  assert.equal(final.floor, 1);
  assert.equal(final.turn, 360);
  assert.equal(mapBackdropState({ progress: .94, complete: true, showcasePhase: -Math.PI }).turn, 324);
});

test('invalid progress and phase inputs cannot leak non-finite CSS values', () => {
  for (const progress of [NaN, Infinity, -Infinity, undefined, -5, 9]) {
    const state = mapBackdropState({ progress, showcasePhase: NaN });
    Object.values(state).forEach(value => assert.ok(Number.isFinite(value)));
    assert.ok(state.progress >= 0 && state.progress <= 1);
    assert.ok(state.radius >= .8 && state.radius <= 1.3);
  }
});
