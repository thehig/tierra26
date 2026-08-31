// Tank View (TANK) — acceptance criteria as executable tests.
// Ref: docs/spec/ui/02-tank-view.md §8. IDs kept 1:1; titles expanded to §8 wording.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CELL_FREE,
  CELL_MOTHER,
  CELL_DAUGHTER,
  PALETTE_SLOTS,
  TANK_THEME_TOKENS,
  genotypeColor,
  makePixelBuffer,
  toPixelBuffer,
  cellToAddress,
  addressToCell,
  pixelToCell,
  cellToPixel,
  hitTest,
  diffFrames,
  motionFromDiff,
  coalesceLatest,
  tankFrameFromObservation,
  tankControls,
  type TankFrameView,
} from '../src/tank-view.ts';

import { Engine } from '../../engine/src/index.ts';
import { observe, makeTank } from '../../engine/src/stats.ts';
import { ANCESTOR_0080AAA } from '../../engine/test/fixtures/ancestor-0080aaa.ts';

// ---- synthetic-frame helpers -----------------------------------------------
function frame(
  width: number,
  height: number,
  cells: number[],
  genotypeOf: number[],
  ips: number[] = [],
  soupSize = width * height,
): TankFrameView {
  const n = width * height;
  const ipFlags = new Uint32Array(n);
  for (const i of ips) ipFlags[i] = 1;
  return {
    width,
    height,
    cells: Uint8Array.from(cells),
    genotypeOf: Uint32Array.from(genotypeOf),
    ips: ipFlags,
    soupSize,
  };
}

function bufEqual(a: ReturnType<typeof makePixelBuffer>, b: ReturnType<typeof makePixelBuffer>): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.klass.every((v, i) => v === b.klass[i]) &&
    a.color.every((v, i) => v === b.color[i]) &&
    a.bright.every((v, i) => v === b.bright[i])
  );
}

// A real engine frame (breeds true from the ancestor; small soup so it fills).
function realTankFrame(): TankFrameView {
  const e = new Engine({ soupSize: 8192 });
  e.inject(ANCESTOR_0080AAA);
  e.run(30000);
  const tank = makeTank(64, 64, e.scenario.soupSize);
  const f = observe(e.world, 8, tank);
  return tankFrameFromObservation(f, e.scenario.soupSize);
}

describe('Tank View (TANK)', () => {
  it('[TANK-001] frame->pixel-buffer is a pure deterministic transform', () => {
    const f = frame(2, 2, [CELL_MOTHER, CELL_FREE, CELL_DAUGHTER, CELL_MOTHER], [7, 0, 7, 9], [0]);
    const a = toPixelBuffer(f, makePixelBuffer(2, 2));
    const b = toPixelBuffer(f, makePixelBuffer(2, 2));
    assert.ok(bufEqual(a, b), 'same frame -> byte-identical buffer');
    // No clock/random: a real engine frame is equally deterministic across calls.
    const rf = realTankFrame();
    const r1 = toPixelBuffer(rf, makePixelBuffer(rf.width, rf.height));
    const r2 = toPixelBuffer(rf, makePixelBuffer(rf.width, rf.height));
    assert.ok(bufEqual(r1, r2));
  });

  it('[TANK-002] buffer geometry matches the frame (row-major; viewport never changes address)', () => {
    const f = frame(3, 2, [1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1]);
    const out = toPixelBuffer(f, makePixelBuffer(3, 2));
    assert.equal(out.width, f.width);
    assert.equal(out.height, f.height);
    assert.equal(out.klass.length, f.width * f.height);
    // row-major: cell (2,1) is index 1*3+2 = 5
    assert.equal(cellToAddress(2, 1, f), 5 * Math.ceil(f.soupSize / (f.width * f.height)));
    // the viewport is presentation-only: the address of a soup cell is viewport-free.
    const addrDirect = cellToAddress(2, 1, f);
    for (const vp of [
      { originX: 0, originY: 0, zoom: 1 },
      { originX: 5, originY: 9, zoom: 4 },
    ]) {
      const { px, py } = cellToPixel(2, 1, vp);
      assert.equal(hitTest(px, py, vp, f).address, addrDirect);
    }
  });

  it('[TANK-003] address<->cell round-trip is exact for every grid cell', () => {
    for (const soupSize of [12, 60000, 4096, 9999]) {
      const w = 8;
      const h = 8;
      const f = frame(w, h, new Array(w * h).fill(0), new Array(w * h).fill(0), [], soupSize);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const rt = addressToCell(cellToAddress(x, y, f), f);
          assert.deepEqual(rt, { x, y }, `round-trip (${x},${y}) soup=${soupSize}`);
        }
      }
    }
  });

  it('[TANK-004] cell-class classification from the frame (FREE/MOTHER/DAUGHTER/dead-noise)', () => {
    // idx: 0 free, 1 mother, 2 daughter, 3 dead-noise (FREE class but genotype named)
    const f = frame(2, 2, [CELL_FREE, CELL_MOTHER, CELL_DAUGHTER, CELL_FREE], [0, 11, 11, 42]);
    const out = toPixelBuffer(f, makePixelBuffer(2, 2));
    assert.deepEqual([...out.klass], [0, 1, 2, 3]);
  });

  it('[TANK-005] genotype->color mapping is stable and id-only (C-UI-SOURCE)', () => {
    assert.equal(genotypeColor(0), 0, 'free/none -> slot 0');
    for (const id of [1, 2, 7, 42, 1000, 65535, 0xffffffff]) {
      assert.equal(genotypeColor(id), genotypeColor(id), 'pure: same id -> same slot');
      assert.notEqual(genotypeColor(id), 0, 'nonzero id never lands on slot 0');
      assert.ok(genotypeColor(id) >= 1 && genotypeColor(id) < PALETTE_SLOTS, 'within bounded slot count');
    }
    // stability does not depend on call/arrival order
    const forward = [3, 8, 15].map(genotypeColor);
    const backward = [15, 8, 3].map(genotypeColor).reverse();
    assert.deepEqual(forward, backward);
  });

  it("[TANK-006] daughter cells reuse the mother's colour index (dim tier)", () => {
    const gid = 21;
    const f = frame(2, 1, [CELL_MOTHER, CELL_DAUGHTER], [gid, gid]);
    const out = toPixelBuffer(f, makePixelBuffer(2, 1));
    assert.equal(out.color[0], genotypeColor(gid));
    assert.equal(out.color[1], out.color[0], 'daughter shares mother color index');
    assert.equal(out.bright[0], 0, 'mother base tier');
    assert.equal(out.bright[1], 1, 'daughter dim tier');
  });

  it('[TANK-007] dead code classifies as dim-noise', () => {
    // FREE class but genotypeOf != 0 -> class 3, dim; pure free (genotype 0) -> class 0.
    const f = frame(2, 1, [CELL_FREE, CELL_FREE], [0, 99]);
    const out = toPixelBuffer(f, makePixelBuffer(2, 1));
    assert.deepEqual([...out.klass], [0, 3]);
    assert.deepEqual([...out.bright], [0, 1]);
    assert.equal(out.color[1], 0, 'dead-noise color index 0; class distinguishes it (§3)');
  });

  it('[TANK-008] IP cells are marked as sparks from the frame (spark wins the tier)', () => {
    // cell 1 is a daughter (dim=1) AND holds an IP -> spark(2) must win.
    const f = frame(3, 1, [CELL_MOTHER, CELL_DAUGHTER, CELL_FREE], [5, 5, 0], [0, 1]);
    const out = toPixelBuffer(f, makePixelBuffer(3, 1));
    assert.equal(out.bright[0], 2, 'IP on mother -> spark');
    assert.equal(out.bright[1], 2, 'IP outranks daughter dim tier');
    assert.equal(out.bright[2], 0, 'cell not in ips is never a spark');
  });

  it('[TANK-009] pixel->address->creature lookup is correct (click-to-inspect)', () => {
    const f = frame(4, 4, new Array(16).fill(0), new Array(16).fill(0), [], 4096);
    f.cells[6] = CELL_MOTHER;
    f.genotypeOf[6] = 77; // cell (2,1)
    const vp = { originX: 0, originY: 0, zoom: 1 };
    const hit = hitTest(2, 1, vp, f);
    assert.equal(hit.address, cellToAddress(2, 1, f));
    assert.equal(hit.genotypeId, 77);
    assert.equal(hit.occupied, true);
    // free space -> occupied:false (a no-op click)
    const miss = hitTest(0, 0, vp, f);
    assert.equal(miss.occupied, false);
    assert.equal(miss.genotypeId, 0);
  });

  it('[TANK-010] pan/zoom composes with hit-testing', () => {
    const f = frame(8, 8, new Array(64).fill(0), new Array(64).fill(0), [], 64);
    const target = { x: 5, y: 3 };
    const idx = target.y * f.width + target.x;
    f.cells[idx] = CELL_MOTHER;
    f.genotypeOf[idx] = 123;
    for (const vp of [
      { originX: 0, originY: 0, zoom: 1 },
      { originX: 2, originY: 1, zoom: 3 },
      { originX: 4, originY: 3, zoom: 7 },
    ]) {
      const { px, py } = cellToPixel(target.x, target.y, vp);
      // any pixel within the zoomed cell resolves to the same cell/address
      const hit = hitTest(px + (vp.zoom - 1), py, vp, f);
      assert.equal(hit.genotypeId, 123, `zoom=${vp.zoom}`);
      assert.equal(hit.address, cellToAddress(target.x, target.y, f));
      assert.equal(hit.occupied, true);
    }
  });

  it('[TANK-011] controls emit worker commands, not local mutations (C-UI-VIEW)', () => {
    const c = tankControls();
    assert.deepEqual(c.run(), { kind: 'run' });
    assert.deepEqual(c.pause(), { kind: 'pause' });
    assert.deepEqual(c.step(), { kind: 'step' });
    assert.deepEqual(c.reset(), { kind: 'reset' });
    assert.deepEqual(c.speed(16), { kind: 'speed', cyclesPerFrame: 16 });
    // no local sim state: issuing a command mutates no supplied frame.
    const f = frame(1, 1, [CELL_MOTHER], [3]);
    const before = [...f.cells];
    c.run();
    c.step();
    assert.deepEqual([...f.cells], before);
  });

  it('[TANK-012] view/control state is a pure function of the latest frame', () => {
    // controls hold no authoritative state: fresh + reused surfaces agree, and
    // repeated calls are identical (no optimistic local run state).
    const c = tankControls();
    assert.deepEqual(c.run(), tankControls().run());
    assert.deepEqual(c.speed(4), c.speed(4));
    // rendered state derives only from the frame: transform is frame-pure.
    const f = frame(2, 1, [CELL_MOTHER, CELL_FREE], [8, 0]);
    const a = toPixelBuffer(f, makePixelBuffer(2, 1));
    const b = toPixelBuffer(f, makePixelBuffer(2, 1));
    assert.ok(bufEqual(a, b));
  });

  it('[TANK-013] latest-frame-wins under coalescing (C-UI-RESPONSIVE)', () => {
    const f0 = frame(2, 1, [CELL_FREE, CELL_FREE], [0, 0]);
    const f1 = frame(2, 1, [CELL_MOTHER, CELL_FREE], [5, 0]);
    const f2 = frame(2, 1, [CELL_MOTHER, CELL_MOTHER], [5, 6]);
    const latest = coalesceLatest([f0, f1, f2]);
    assert.equal(latest, f2, 'newest queued frame wins');
    // painting only the newest == painting it directly (dropping f0,f1 never corrupts)
    const coalesced = toPixelBuffer(latest!, makePixelBuffer(2, 1));
    const direct = toPixelBuffer(f2, makePixelBuffer(2, 1));
    assert.ok(bufEqual(coalesced, direct));
    assert.equal(coalesceLatest([]), null);
  });

  it('[TANK-014] render loop decoupled from sim cadence', () => {
    // however many frames were skipped, transforming frame N yields the same
    // buffer whether or not earlier frames were painted into the reused buffer.
    const fA = frame(2, 1, [CELL_MOTHER, CELL_FREE], [1, 0]);
    const fB = frame(2, 1, [CELL_FREE, CELL_DAUGHTER], [0, 2], [1]);
    const reused = makePixelBuffer(2, 1);
    toPixelBuffer(fA, reused); // simulate an earlier paint into the same buffer
    const afterSkip = toPixelBuffer(fB, reused);
    const fresh = toPixelBuffer(fB, makePixelBuffer(2, 1));
    assert.ok(bufEqual(afterSkip, fresh), 'buffer correctness independent of arrival cadence');
  });

  it('[TANK-015] birth/death diff is a pure function of two frames', () => {
    const prev = frame(2, 2, [CELL_FREE, CELL_MOTHER, CELL_MOTHER, CELL_FREE], [0, 5, 6, 0]);
    const next = frame(2, 2, [CELL_MOTHER, CELL_MOTHER, CELL_FREE, CELL_DAUGHTER], [7, 5, 0, 8]);
    const d = diffFrames(prev, next);
    assert.deepEqual([...d.born], [0, 3], 'free->occupied');
    assert.deepEqual([...d.died], [2], 'occupied->free');
    // pure: same inputs -> same diff
    const d2 = diffFrames(prev, next);
    assert.deepEqual([...d2.born], [...d.born]);
    assert.deepEqual([...d2.died], [...d.died]);
  });

  it('[TANK-016] reduced-motion is honored (C-UI-A11Y)', () => {
    const prev = frame(2, 1, [CELL_FREE, CELL_MOTHER], [0, 1]);
    const next = frame(2, 1, [CELL_MOTHER, CELL_FREE], [2, 0]);
    const d = diffFrames(prev, next);
    const full = motionFromDiff(d, false);
    const reduced = motionFromDiff(d, true);
    assert.equal(full.animate, true);
    assert.equal(reduced.animate, false, 'reduced-motion snaps instantly');
    // the flag gates only motion, never data:
    assert.deepEqual([...reduced.born], [...full.born]);
    assert.deepEqual([...reduced.died], [...full.died]);
  });

  it('[TANK-017] colors are theme tokens (C-UI-THEME)', () => {
    // the view emits integer indices/roles, never hard-coded hex.
    assert.ok(TANK_THEME_TOKENS.includes('background'));
    assert.ok(TANK_THEME_TOKENS.includes('free'));
    assert.ok(TANK_THEME_TOKENS.includes('spark'));
    const idx = genotypeColor(1234);
    assert.equal(typeof idx, 'number');
    assert.ok(Number.isInteger(idx) && idx >= 0 && idx < PALETTE_SLOTS, 'a themable slot, not a hex');
  });

  it('[TANK-018] same frame sequence -> identical buffers for any viewer (determinism)', () => {
    const seq = [
      frame(2, 2, [1, 0, 0, 0], [3, 0, 0, 0], [0]),
      frame(2, 2, [1, 2, 0, 0], [3, 3, 0, 0], [1]),
      frame(2, 2, [1, 1, 2, 0], [3, 3, 4, 0], [2]),
    ];
    const viewerA = seq.map((f) => toPixelBuffer(f, makePixelBuffer(2, 2)));
    const viewerB = seq.map((f) => toPixelBuffer(f, makePixelBuffer(2, 2)));
    for (let i = 0; i < seq.length; i++) assert.ok(bufEqual(viewerA[i]!, viewerB[i]!));
  });

  it('[TANK-019] (visual) memory-map substrate: stable bounded genotype slots', () => {
    // The pixel-level palette/borders are the design pass; the testable substrate
    // is a stable, bounded ColorIndex per genotype driving colored regions.
    const rf = realTankFrame();
    const out = toPixelBuffer(rf, makePixelBuffer(rf.width, rf.height));
    for (let i = 0; i < out.color.length; i++) {
      assert.ok(out.color[i]! >= 0 && out.color[i]! < PALETTE_SLOTS);
      if (rf.cells[i] === CELL_MOTHER || rf.cells[i] === CELL_DAUGHTER) {
        assert.equal(out.color[i], genotypeColor(rf.genotypeOf[i]!), 'region hue = genebank id hash');
      }
    }
  });

  it('[TANK-020] (visual) IP sparks & dead-noise texture substrate is distinct', () => {
    const f = frame(3, 1, [CELL_MOTHER, CELL_FREE, CELL_FREE], [5, 0, 9], [0]);
    const out = toPixelBuffer(f, makePixelBuffer(3, 1));
    assert.equal(out.bright[0], 2, 'spark tier');
    assert.equal(out.klass[2], 3, 'dead-noise class');
    assert.equal(out.bright[2], 1, 'dead-noise dim tier');
    assert.equal(out.klass[1], 0, 'pure free distinct from dead-noise');
    // three visually-distinct signals: spark(2) vs dim(1) vs base/free(0)
    assert.notEqual(out.bright[0], out.bright[2]);
    assert.notEqual(out.bright[2], out.bright[1]);
  });

  it('[TANK-021] (visual) birth/death & daughter-growth animation inputs', () => {
    const prev = frame(2, 1, [CELL_FREE, CELL_MOTHER], [0, 5]);
    const next = frame(2, 1, [CELL_DAUGHTER, CELL_FREE], [5, 0]);
    const d = diffFrames(prev, next);
    assert.deepEqual([...d.born], [0], 'birth drives juice');
    assert.deepEqual([...d.died], [1], 'death drives fade');
    // daughter grows in the mother's hue at the dim tier (growth animation input)
    const out = toPixelBuffer(next, makePixelBuffer(2, 1));
    assert.equal(out.color[0], genotypeColor(5));
    assert.equal(out.bright[0], 1);
  });

  it('[TANK-022] (visual) pan/zoom feel: integer zoom keeps geometry crisp & exact', () => {
    const vp = { originX: 3, originY: 2, zoom: 5 };
    // cellToPixel / pixelToCell invert across the integer viewport (crisp cells).
    for (const [x, y] of [
      [3, 2],
      [10, 8],
      [7, 4],
    ] as const) {
      const { px, py } = cellToPixel(x, y, vp);
      assert.deepEqual(pixelToCell(px, py, vp), { x, y });
      // any sub-pixel within the zoomed cell maps back to the same cell
      assert.deepEqual(pixelToCell(px + vp.zoom - 1, py + vp.zoom - 1, vp), { x, y });
    }
  });
});
