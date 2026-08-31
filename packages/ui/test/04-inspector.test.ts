// Inspector (INSPECTOR) — acceptance criteria as passing tests.
// Ref: docs/spec/ui/04-inspector.md §8. Keep 1:1 with the doc.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { InspectView } from '../src/protocol.ts';
import {
  toPanelModel,
  makeDisassembler,
  buildInspectRequest,
  inspectRequestToHost,
  matchInspectResult,
  type Disassembler,
} from '../src/inspector.ts';
import { disassemble } from '../../genescript/src/disasm.ts';
import { classic32 } from '../../engine/src/isa.ts';

// The real shared disassembler (same one the Editor's peek-under-hood uses).
const disasm: Disassembler = makeDisassembler(disassemble, classic32);

// classic32 opcodes used for legible single-verb genomes:
//   incA=8 (grow-a), incB=9 (grow-b), zero=4 (clear).
const G_INCA = 8, G_INCB = 9, G_ZERO = 4;

function makeView(over: Partial<InspectView> = {}): InspectView {
  const genome = over.genome ?? new Uint8Array([G_INCA, G_INCB, G_ZERO]);
  return {
    address: 100,
    occupied: true,
    creatureId: 7,
    parentId: 3,
    bornAtCycle: 1000,
    genotypeId: 42,
    genotypeLabel: '0080aaa',
    population: 5,
    founderId: 1,
    ip: 100, // cell.start -> offset 0
    registers: { A: 11, B: 22, C: 33, D: 44 },
    flags: { E: true, S: false, Z: true },
    stack: [10, 20, 30, 0, 0, 0, 0, 0, 0, 0],
    sp: 3,
    cell: { start: 100, size: 3 },
    daughter: null,
    genome,
    ...over,
  };
}

describe('Inspector (INSPECTOR)', () => {
  it('[INSPECTOR-001] toPanelModel is a pure function of InspectView (+ disassembler) — no clock/RNG/engine', () => {
    const v = makeView();
    const before = JSON.stringify({ ...v, genome: Array.from(v.genome) });
    const a = toPanelModel(v, disasm, 1500);
    const b = toPanelModel(v, disasm, 1500);
    assert.deepEqual(a, b); // same input -> same panels
    // input view is not mutated (read-only projection)
    assert.equal(JSON.stringify({ ...v, genome: Array.from(v.genome) }), before);
  });

  it('[INSPECTOR-002] registers A–D in the panel equal the engine state in the view', () => {
    const v = makeView({ registers: { A: 1, B: 2, C: 3, D: 4 } });
    const m = toPanelModel(v, disasm)!;
    assert.deepEqual(m.registers, [
      { name: 'A', value: 1 },
      { name: 'B', value: 2 },
      { name: 'C', value: 3 },
      { name: 'D', value: 4 },
    ]);
  });

  it('[INSPECTOR-003] flags E/S/Z render their boolean state from the view', () => {
    const v = makeView({ flags: { E: false, S: true, Z: false } });
    const m = toPanelModel(v, disasm)!;
    assert.deepEqual(m.flags, [
      { name: 'E', on: false },
      { name: 'S', on: true },
      { name: 'Z', on: false },
    ]);
  });

  it('[INSPECTOR-004] stack rows reflect stack/sp with the top slot marked; sp==0 → empty', () => {
    const m = toPanelModel(makeView({ sp: 3 }), disasm)!;
    assert.deepEqual(m.stackRows, [
      { index: 0, value: 10, isTop: false },
      { index: 1, value: 20, isTop: false },
      { index: 2, value: 30, isTop: true }, // top = sp-1
    ]);
    // sp==0 -> empty
    assert.deepEqual(toPanelModel(makeView({ sp: 0 }), disasm)!.stackRows, []);
    // full stack (10) renders all slots
    const full = toPanelModel(makeView({ sp: 10 }), disasm)!;
    assert.equal(full.stackRows.length, 10);
    assert.equal(full.stackRows[9]!.isTop, true);
  });

  it('[INSPECTOR-005] the disassembly marks exactly the row whose byte range contains the IP', () => {
    // genome [incA,incB,zero] -> 3 one-byte rows. ip=cell.start+1 -> offset 1 -> row 2.
    const v = makeView({ ip: 101, cell: { start: 100, size: 3 } });
    const m = toPanelModel(v, disasm)!;
    const marked = m.disassembly.filter((r) => r.isIp);
    assert.equal(marked.length, 1); // exactly one row
    assert.deepEqual(marked[0]!.bytes, [1, 2]);
    assert.equal(marked[0]!.line, 2);
  });

  it('[INSPECTOR-006] daughter fillPct = floor(written*100/size) (integer); null daughter → no panel', () => {
    // 7/16 = 43.75 -> 43
    const withDau = toPanelModel(
      makeView({ daughter: { start: 200, size: 16, written: 7 } }),
      disasm,
    )!;
    assert.deepEqual(withDau.daughter, { present: true, fillPct: 43 });
    assert.equal(Number.isInteger(withDau.daughter!.fillPct), true);
    // null daughter -> no daughter panel
    assert.equal(toPanelModel(makeView({ daughter: null }), disasm)!.daughter, null);
  });

  it('[INSPECTOR-007] genotype label + population resolve from the genebank via the view (C-UI-SOURCE)', () => {
    const v = makeView({ genotypeLabel: '0080gene', population: 137, parentId: 9, creatureId: 55 });
    const m = toPanelModel(v, disasm)!;
    assert.equal(m.header.genotype, '0080gene'); // straight from view, not recomputed
    assert.equal(m.header.population, 137);
    assert.equal(m.header.id, 55);
    assert.equal(m.header.parent, 9);
  });

  it('[INSPECTOR-008] "open in editor" yields a genome byte-identical to what the Inspector disassembles (UIINV-EDITOR-ENGINE)', () => {
    const genome = new Uint8Array([G_INCA, G_INCB, G_ZERO, G_INCA]);
    const v = makeView({ genome });
    const m = toPanelModel(v, disasm)!;
    assert.equal(m.openInEditorGenome, v.genome); // same bytes handed to the Editor
    assert.deepEqual(Array.from(m.openInEditorGenome), Array.from(genome));
  });

  it('[INSPECTOR-009] detail is fetched via the worker requestInspect; no direct engine call, no mutation (C-UI-VIEW)', () => {
    const req = buildInspectRequest('sess-1', 100, 'corr-1');
    const cmd = inspectRequestToHost(req);
    assert.equal(cmd.type, 'requestInspect'); // worker-mediated, no engine call
    assert.equal((cmd as { addr: number }).addr, 100);
    assert.equal(cmd.sessionId, 'sess-1');
    assert.equal(cmd.correlationId, 'corr-1');
    // projection mutates nothing
    const v = makeView();
    const snap = JSON.stringify({ ...v, genome: Array.from(v.genome) });
    toPanelModel(v, disasm);
    assert.equal(JSON.stringify({ ...v, genome: Array.from(v.genome) }), snap);
  });

  it('[INSPECTOR-010] the marked IP line equals the peek-under-hood line the Editor marks for the same genome+ip', () => {
    const genome = new Uint8Array([G_INCA, G_INCB, G_ZERO]);
    const v = makeView({ genome, ip: 102, cell: { start: 100, size: 3 } });
    const m = toPanelModel(v, disasm)!;
    // Independently compute what the shared disassembler yields (same as the Editor).
    const lines = disassemble(genome, classic32).lines;
    const off = v.ip - v.cell.start; // 2
    const expected = lines.findIndex((l) => off >= l.bytes[0] && off < l.bytes[1]);
    const markedIdx = m.disassembly.findIndex((r) => r.isIp);
    assert.equal(markedIdx, expected); // Inspector marks the same line the Editor would
    assert.equal(m.disassembly[markedIdx]!.text, lines[expected]!.text);
  });

  it('[INSPECTOR-011] a garbage/mutated genome still renders a full disassembly (DISASM never throws)', () => {
    const garbage = new Uint8Array([200, 201, 255, 0, 7, 130]);
    const v = makeView({ genome: garbage, ip: 100, cell: { start: 100, size: garbage.length } });
    let m: ReturnType<typeof toPanelModel> = null;
    assert.doesNotThrow(() => { m = toPanelModel(v, disasm); });
    assert.notEqual(m, null);
    assert.equal(m!.disassembly.length > 0, true); // rows for every byte
    // byte ranges tile the whole genome
    assert.equal(m!.disassembly[m!.disassembly.length - 1]!.bytes[1], garbage.length);
  });

  it('[INSPECTOR-012] occupied:false (free/dead address) renders an empty state, no panels', () => {
    const v = makeView({ occupied: false });
    assert.equal(toPanelModel(v, disasm), null);
  });

  it('[INSPECTOR-013] concurrent inspect requests are matched by correlationId, never crossed', () => {
    const r1 = buildInspectRequest('s', 100, 'c-100');
    const r2 = buildInspectRequest('s', 200, 'c-200');
    const pending = [r1, r2];
    // reply for r2 arrives first — must match r2, not r1.
    assert.equal(matchInspectResult(pending, { correlationId: 'c-200' }), r2);
    assert.equal(matchInspectResult(pending, { correlationId: 'c-100' }), r1);
    // unknown / missing correlationId matches nothing (never cross-binds)
    assert.equal(matchInspectResult(pending, { correlationId: 'c-999' }), undefined);
    assert.equal(matchInspectResult(pending, {}), undefined);
  });

  it('[INSPECTOR-014] (visual) panel layout, register/flag chips, stack and disassembly styling', () => {
    // Headless proxy: the model exposes every field the panel layout renders as chips/rows.
    const m = toPanelModel(
      makeView({ daughter: { start: 200, size: 10, written: 5 } }),
      disasm,
      2000,
    )!;
    assert.equal(m.registers.length, 4);              // A–D chips
    assert.deepEqual(m.registers.map((r) => r.name), ['A', 'B', 'C', 'D']);
    assert.equal(m.flags.length, 3);                  // E/S/Z chips
    assert.deepEqual(m.flags.map((f) => f.name), ['E', 'S', 'Z']);
    assert.equal(m.stackRows.length, 3);              // stack rows
    assert.equal(m.disassembly.length >= 1, true);    // disassembly rows
    assert.equal(typeof m.header.age, 'number');      // header derived age = 2000-1000
    assert.equal(m.header.age, 1000);
    assert.deepEqual(m.daughter, { present: true, fillPct: 50 });
  });
});
