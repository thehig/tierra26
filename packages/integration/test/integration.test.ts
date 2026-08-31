// Cross-package integration invariants (INT-*). Engine-level ones are real (they import the
// real @tierra26/engine via relative path); the ones needing genescript/content/ui/versus src
// remain pending until those packages implement.
// Ref: docs/spec/validation/C-test-coverage-gaps.md §3.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, type RunDescriptor } from '../../engine/src/index.ts';
import { classic32, buildSubset } from '../../engine/src/isa.ts';
import { ANCESTOR_0080AAA as ANC } from '../../engine/test/fixtures/ancestor-0080aaa.ts';
import { compile } from '../../genescript/src/comp.ts';
import { disassemble } from '../../genescript/src/disasm.ts';
import { ANCESTOR_GS } from '../../genescript/src/ancestor.gs.ts';
import { hasErrors } from '../../genescript/src/types.ts';

const dig = (e: Engine) => JSON.stringify(e.digest(e.cycles));

describe('Cross-package integration (INT)', () => {
  it('[INT-ANCESTOR-GOLDEN] 0080aaa breeds true sterile and matches a pinned RunDigest (S11)', () => {
    const e = new Engine({ seed: 42, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    e.inject(ANC, { founderId: 1 }); e.run(1_000_000);
    const d = e.digest(e.cycles);
    assert.equal(d.genotypes, 1);            // breeds true
    assert.ok(d.births > 100);
    assert.deepEqual(d, { atCycle: 1_000_000, population: 351, genotypes: 1, births: 839, deaths: 488, soupChecksum: 3717516734 });
  });

  it('[INT-SNAPSHOT-REPLAY-E2E] live == replay == restore digest (mutation on)', () => {
    const scenario = { seed: 5, mutation: { flaw: 0, copy: 200, cosmic: 4000 } } as any;
    const live = new Engine(scenario); live.inject(ANC, { founderId: 1 }); live.run(600_000);
    const desc: RunDescriptor = { engineVersion: Engine.version, scenario, injections: [{ atCycle: 0, genome: ANC, founderId: 1 }], cycles: 600_000 };
    const replay = Engine.replay(desc);
    assert.equal(dig(replay), dig(live));
    // restore mid-run and continue
    const e2 = new Engine(scenario); e2.inject(ANC, { founderId: 1 }); e2.run(300_000);
    const s = e2.snapshot(); e2.run(300_000);
    const r = Engine.restore(s); r.run(300_000);
    assert.equal(dig(r), dig(e2));
  });

  it('[INT-FOUNDER-ATTRIB-MUTATION] per-founder census partitions population under mutation', () => {
    const e = new Engine({ seed: 9, soupSize: 20000, mutation: { flaw: 0, copy: 300, cosmic: 5000 } });
    e.inject(ANC, { founderId: 1 });
    e.inject(ANC, { founderId: 2 });
    e.run(1_000_000);
    let sum = 0; for (const c of e.world.creatures.values()) { assert.ok(c.founderId === 1 || c.founderId === 2); }
    for (const x of e.world.founders) sum += x;
    assert.equal(sum, e.world.creatures.size);        // partition (VSINV-ATTRIB)
    assert.equal(e.world.founders[1]! + e.world.founders[2]!, e.world.creatures.size);
  });

  it('[INT-EDITOR-ENGINE] compile(GeneScript) bytes == injected == disassembly (one genome, three views)', () => {
    const src = 'top:\ngrow-a\ncopy-byte\njump-back top\nmake-space\ndivide';
    const compiled = compile(src, classic32).bytes;
    const e = new Engine({ seed: 1 });
    const id = e.inject(compiled, { founderId: 1 });
    const c = e.world.creatures.get(id)!;
    const injected = new Uint8Array(c.size);
    for (let i = 0; i < c.size; i++) injected[i] = e.world.soup.read(c.start + i);
    assert.deepEqual([...injected], [...compiled]);                    // editor == injected
    // disassembling the injected genome recompiles to the same bytes (peek-under-hood consistency)
    const recompiled = compile(disassemble(injected, classic32).source, classic32).bytes;
    assert.deepEqual([...compile(disassemble(recompiled, classic32).source, classic32).bytes], [...recompiled]);
  });

  it('[INT-GS-ANCESTOR] the GeneScript ancestor compiles to a genome that breeds true (GSINV-ANCESTOR)', () => {
    const r = compile(ANCESTOR_GS, classic32);
    assert.equal(hasErrors(r.diagnostics), false);
    const e = new Engine({ seed: 7, mutation: { flaw: 0, copy: 0, cosmic: 0 } });
    e.inject(r.bytes, { founderId: 1 }); e.run(400_000);
    assert.equal(e.stats().genotypes, 1);      // breeds true through the compiler
    assert.ok(e.stats().births > 20);
  });

  it('[INT-SUBSET-PORTABLE] a named subset emits identical bytes across compiles (S10)', () => {
    const sub = buildSubset('ch', ['movii', 'incA', 'jmpb', 'mal', 'divide']);
    const src = 'grow-a\ncopy-byte\nmake-space\ndivide';
    const a = compile(src, sub).bytes, b = compile(src, sub).bytes;
    assert.deepEqual([...a], [...b]);           // deterministic + portable under the subset
    for (const byte of a) assert.ok(byte >= 0 && byte < sub.n);
  });

  // Pending — need content/ui/versus src:
  it.todo('[INT-CONTENT-COMPILE] every shipped starter genome compiles under its subset + loads');
  it.todo('[INT-FRAME-VIEWS] one ObservationFrame feeds tank/charts/inspector consistently');
  it.todo('[INT-SUBSET-PORTABLE] a named subset emits identical bytes across content→genescript→engine');
  it.todo('[INT-GOAL-DETERMINISM] a content goal-checker verdict is identical across same-seed runs');
  it.todo('[INT-VERSUS-MATCH-REPLAY] a MatchDescriptor replays identical standings + result');
});
