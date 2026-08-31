// Snapshot & Reproducibility (SNAP) — real tests. Ref: docs/spec/engine/systems/14-snapshot-and-reproducibility.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, type RunDescriptor } from '../src/index.ts';
import { ANCESTOR_0080AAA as ANC } from './fixtures/ancestor-0080aaa.ts';

function evo(seed: number, cycles: number) {
  const e = new Engine({ seed, mutation: { flaw: 0, copy: 200, cosmic: 4000 } });
  e.inject(ANC, { founderId: 1 }); e.run(cycles); return e;
}
const dig = (e: Engine) => JSON.stringify(e.digest(e.cycles));
const desc = (seed: number, cycles: number): RunDescriptor => ({
  engineVersion: Engine.version, scenario: { seed, mutation: { flaw: 0, copy: 200, cosmic: 4000 } } as any,
  injections: [{ atCycle: 0, genome: ANC, founderId: 1 }], cycles,
});

describe('Snapshot & Reproducibility (SNAP)', () => {
  it('[SNAP-001] snapshot captures RNG state (length-4 Uint32Array)', () => {
    const s = evo(3, 100_000).snapshot();
    assert.ok(s.world.rngState instanceof Uint32Array); assert.equal(s.world.rngState.length, 4);
  });

  it('[SNAP-007] snapshot is reference-free (mutating the engine does not change the snapshot)', () => {
    const e = evo(3, 100_000); const s = e.snapshot();
    const soup0 = Uint8Array.from(s.world.soup);
    e.run(50_000);
    assert.deepEqual(Array.from(s.world.soup), Array.from(soup0)); // snapshot unchanged
  });

  it('[SNAP-008] snapshot serializes the completeness set', () => {
    const s = evo(3, 100_000).world;
    const w = s.snapshot ? null : null; void w;
    const snap = evo(3, 100_000).snapshot().world;
    for (const k of ['cycles', 'nextId', 'births', 'deaths', 'generations', 'genAccum', 'avgSizeVal', 'cursor', 'rngState', 'soup', 'mutationState', 'founders', 'genebank', 'allocs', 'slicerQ', 'reaperQ', 'creatures']) {
      assert.ok(k in snap, `missing ${k}`);
    }
  });

  it('[SNAP-010] creatures captured in slicer-queue order', () => {
    const snap = evo(3, 150_000).snapshot().world;
    assert.deepEqual(snap.creatures.map((c) => c.id), snap.slicerQ);
  });

  it('[SNAP-002] restore continues bit-identically for N cycles (INV-ROUNDTRIP)', () => {
    const e = evo(3, 300_000); const s = e.snapshot();
    e.run(150_000); const live = dig(e);
    const r = Engine.restore(s); r.run(150_000);
    assert.equal(dig(r), live);
  });

  it('[SNAP-009] restore reconstructs queue membership (INV-QUEUE)', () => {
    const r = Engine.restore(evo(3, 200_000).snapshot());
    const ids = new Set([...r.world.creatures.keys()]);
    assert.equal(r.world.slicerView().length, ids.size);
    assert.equal(r.world.reaperView().length, ids.size);
    for (const id of r.world.slicerView()) assert.ok(ids.has(id));
  });

  it('[SNAP-003] replay(desc) digest equals live-run digest (INV-REPLAY)', () => {
    const live = evo(5, 600_000);
    const rep = Engine.replay(desc(5, 600_000));
    assert.equal(dig(rep), dig(live));
  });

  it('[SNAP-004] same RunDescriptor → identical snapshots (INV-DET)', () => {
    const a = Engine.replay(desc(9, 400_000)).snapshot();
    const b = Engine.replay(desc(9, 400_000)).snapshot();
    assert.deepEqual(Array.from(a.world.soup), Array.from(b.world.soup));
    assert.deepEqual(a.world.creatures.map((c) => c.id), b.world.creatures.map((c) => c.id));
  });

  it('[SNAP-005] engineVersion mismatch is detected on restore/replay', () => {
    const s = evo(3, 50_000).snapshot(); (s as any).engineVersion = 'bogus';
    assert.throws(() => Engine.restore(s), /VERSION_MISMATCH/);
    const d = desc(3, 50_000); d.engineVersion = 'bogus';
    assert.throws(() => Engine.replay(d), /VERSION_MISMATCH/);
  });

  it('[SNAP-006] digest stable across same-seed runs', () => {
    assert.equal(dig(evo(7, 300_000)), dig(evo(7, 300_000)));
  });

  it('[SNAP-011] founderId serialized + restored', () => {
    const r = Engine.restore(evo(3, 200_000).snapshot());
    for (const c of r.world.creatures.values()) assert.equal(c.founderId, 1);
  });

  it('[SNAP-012] slicer cursor serialized/restored', () => {
    const e = evo(3, 123_456); const s = e.snapshot();
    assert.equal(Engine.restore(s).world.cursorPos(), s.world.cursor);
  });

  it('[SNAP-013] mutation counters serialized/restored (cadence continues in phase)', () => {
    const e = evo(3, 200_000); const s = e.snapshot();
    e.run(100_000); const live = dig(e);
    const r = Engine.restore(s); r.run(100_000);
    assert.equal(dig(r), live); // identical continuation requires in-phase mutation counters
    assert.deepEqual(Engine.restore(s).world.mutation.state(), s.world.mutationState);
  });

  it('[SNAP-014] genebank table serialized/restored (labels continue)', () => {
    const e = evo(3, 250_000); const s = e.snapshot();
    const r = Engine.restore(s);
    assert.equal(r.world.genebank.count(), s.world.genebank.length);
    assert.equal(r.world.genebank.all()[0]!.label, s.world.genebank[0]!.label);
  });

  it('[SNAP-015] generations + avgSize serialized/restored', () => {
    const e = evo(3, 300_000); const s = e.snapshot(); const r = Engine.restore(s);
    assert.equal(r.world.generations, s.world.generations);
    assert.equal(r.world.avgSize(), s.world.avgSizeVal);
  });

  it('[SNAP-016] completeness: restore continued N == live continued N (mutation-on)', () => {
    const e = evo(3, 400_000); const s = e.snapshot();
    e.run(250_000); const live = dig(e);
    const r = Engine.restore(s); r.run(250_000);
    assert.equal(dig(r), live); // any omitted mutable field would diverge here
  });
});
