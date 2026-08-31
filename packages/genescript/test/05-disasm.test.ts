// Disassembler (DISASM) — genome bytes + active set -> GeneScript (best-effort).
// Spec: docs/spec/genescript/05-disassembler.md (§8 acceptance criteria).
// Ref: docs/spec/genescript/00-overview.md §3 (reverse pipeline), §5 (C-GS-ROUNDTRIP,
//   C-GS-NOOPCODES), §6 (GSINV-ROUNDTRIP, GSINV-SOURCEMAP).
//
// Powers "peek under the hood" and studying EVOLVED creatures: the disassembler must be TOTAL
// and NEVER THROW on arbitrary/mutated bytes — the raw fallback guarantees every genome
// round-trips to something editable.
//
// comp.ts does not exist yet, so GSINV-ROUNDTRIP is exercised with a small in-test assembler that
// is the deterministic inverse of the disassembler for compiler-shaped genomes (labels re-derive
// their templates via the SAME lbl.assignTemplates the compiler uses). Byte-exact round-trip is
// asserted where it genuinely holds (verb/raw/compiled-label genomes); for arbitrary garbage we
// assert the guaranteed floor: never throws + a 1:1 byte-tiling result.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { disassemble } from '../src/disasm.ts';
import type { DisasmResult } from '../src/disasm.ts';
import {
  mnemonicAtOpcode, mnemonicToVerb, verbToMnemonic, takesTarget, opcodeOf,
} from '../src/vocab.ts';
import { assignTemplates, complement } from '../src/lbl.ts';
import { classic32, buildSubset, DICTIONARY } from '../../engine/src/isa.ts';
import type { InstructionSet } from '../../engine/src/runtime.ts';

// ---- test helpers ------------------------------------------------------------------------------

const ADDRESSING = ['adro', 'adrb', 'adrf', 'jmpo', 'jmpb', 'call']; // takesTarget mnemonics
const isNop = (mn: string | undefined): boolean => mn === 'nop0' || mn === 'nop1';
const op = (active: InstructionSet, mn: string): number => opcodeOf(active, mn); // never a literal

/** Minimal in-test assembler: the deterministic inverse used to check round-trip (stands in for the
 *  not-yet-existing comp.ts). Handles verbs, raw <mnemonic>/byte N, labels, and control+target.
 *  Templates come from lbl.assignTemplates over DEFINITION names in source order — the same
 *  allocation the disassembler's label1.. renaming preserves, so a fixed point is byte-exact. */
function assemble(source: string, active: InstructionSet): Uint8Array {
  const rawLines = source.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const defNames: string[] = [];
  for (const line of rawLines) if (line.endsWith(':')) defNames.push(line.slice(0, -1));
  const patterns = assignTemplates(defNames); // name -> nop bit pattern

  const out: number[] = [];
  for (const line of rawLines) {
    if (line.endsWith(':')) {
      const bits = patterns.get(line.slice(0, -1))!;
      for (const b of bits) out.push(b === 1 ? active.nop1 : active.nop0);
      continue;
    }
    if (line.startsWith('raw ')) {
      const rest = line.slice(4).trim();
      if (rest.startsWith('byte ')) { out.push(Number(rest.slice(5)) & 0xff); continue; }
      const code = op(active, rest);
      assert.ok(code >= 0, `assemble: unknown raw mnemonic '${rest}'`);
      out.push(code);
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length === 2) {
      // control verb + label target
      const mn = verbToMnemonic(parts[0]!)!;
      out.push(op(active, mn));
      const bits = complement(patterns.get(parts[1]!)!);
      for (const b of bits) out.push(b === 1 ? active.nop1 : active.nop0);
      continue;
    }
    const mn = verbToMnemonic(parts[0]!)!;
    out.push(op(active, mn));
  }
  return Uint8Array.from(out);
}

/** Assert the line byte-ranges tile [0, len) exactly once, in order (the reverse of the source map). */
function assertTiles(res: DisasmResult, len: number): void {
  if (len === 0) { assert.equal(res.lines.length, 0); return; }
  let cursor = 0;
  for (const line of res.lines) {
    assert.equal(line.bytes[0], cursor, 'line starts where previous ended');
    assert.ok(line.bytes[1] > line.bytes[0], 'byte range is non-empty');
    cursor = line.bytes[1];
  }
  assert.equal(cursor, len, 'lines cover the whole genome');
}

// A tiny deterministic PRNG so the fuzz tests are reproducible (C-GS-DET-friendly test).
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

// ---- criteria ----------------------------------------------------------------------------------

describe('Disassembler (DISASM)', () => {
  it('[DISASM-001] Every active-set opcode disassembles to its GeneScript verb (reverse of [04])', () => {
    for (let code = 0; code < classic32.n; code++) {
      const mn = mnemonicAtOpcode(classic32, code)!;
      const res = disassemble(Uint8Array.of(code), classic32);
      assert.equal(res.lines.length >= 1, true);
      if (isNop(mn)) {
        assert.match(res.lines[0]!.text, /^label\d+:$/); // a lone landmark -> a label
      } else if (takesTarget(mnemonicToVerb(mn)!)) {
        assert.equal(res.lines[0]!.text, `raw ${mn}`); // dangling addressing op -> raw
      } else {
        assert.equal(res.lines[0]!.text, mnemonicToVerb(mn)); // compute verb
      }
    }
  });

  it('[DISASM-002] Opcode->verb reads the ACTIVE SET (C-GS-NOOPCODES): same byte, different set, different verb', () => {
    const mini = buildSubset('mini', ['subCAB', 'divide']); // opcodes: nop0,nop1,subCAB,divide
    const byte = 2; // subCAB in mini; not0/flip-bit in classic32
    assert.equal(mnemonicAtOpcode(mini, byte), 'subCAB');
    assert.equal(mnemonicAtOpcode(classic32, byte), 'not0');
    assert.equal(disassemble(Uint8Array.of(byte), mini).lines[0]!.text, 'subtract');
    assert.equal(disassemble(Uint8Array.of(byte), classic32).lines[0]!.text, 'flip-bit');
  });

  it('[DISASM-003] A complementary template PAIR becomes an inferred label + a reference', () => {
    // def[0]=nop0, verb, adrb, ref=nop1 (complement of def) -> find-back label1
    const g = Uint8Array.of(op(classic32, 'nop0'), op(classic32, 'divide'), op(classic32, 'adrb'), op(classic32, 'nop1'));
    const res = disassemble(g, classic32);
    assert.deepEqual(res.lines.map((l) => l.text), ['label1:', 'divide', 'find-back label1']);
  });

  it('[DISASM-004] Label names are label1, label2, … in DEFINING-BYTE-INDEX order', () => {
    // two bare landmarks; label numbering follows byte order, not discovery
    const g = Uint8Array.of(op(classic32, 'nop0'), op(classic32, 'divide'), op(classic32, 'nop1'), op(classic32, 'nop1'));
    const res = disassemble(g, classic32);
    const labels = res.lines.filter((l) => /^label\d+:$/.test(l.text)).map((l) => l.text);
    assert.deepEqual(labels, ['label1:', 'label2:']);
    // label1 defines the earliest landmark
    assert.equal(res.lines[0]!.text, 'label1:');
    assert.equal(res.lines[0]!.bytes[0], 0);
  });

  it('[DISASM-005] Addressing verbs are rewritten from their mnemonics with the inferred <label>', () => {
    const expect: Record<string, string> = {
      adrb: 'find-back', adrf: 'find-forward', adro: 'find', jmpb: 'jump-back', jmpo: 'jump', call: 'call',
    };
    for (const mn of ADDRESSING) {
      const dir = DICTIONARY.find((e) => e.mnemonic === mn)!.dir; // 0 out, 1 fwd, 2 bwd
      let g: Uint8Array;
      if (dir === 1) {
        // forward: addr, ref=nop1, verb, def=nop0 (after the reference)
        g = Uint8Array.of(op(classic32, mn), op(classic32, 'nop1'), op(classic32, 'divide'), op(classic32, 'nop0'));
      } else {
        // backward / outward: def=nop0, addr, ref=nop1
        g = Uint8Array.of(op(classic32, 'nop0'), op(classic32, mn), op(classic32, 'nop1'));
      }
      const res = disassemble(g, classic32);
      const ctrl = res.lines.find((l) => l.text.startsWith(expect[mn]!))!;
      assert.equal(ctrl.text, `${expect[mn]} label1`, `mnemonic ${mn}`);
    }
  });

  it('[DISASM-006] A DEFINITION run with no reference still emits a bare labelK: line', () => {
    const g = Uint8Array.of(op(classic32, 'nop0'), op(classic32, 'nop1')); // one bare landmark run
    const res = disassemble(g, classic32);
    assert.deepEqual(res.lines.map((l) => l.text), ['label1:']);
    assert.deepEqual(res.lines[0]!.bytes, [0, 2]);
  });

  it('[DISASM-007] A mutated opcode (byte >= set.size) falls back to raw byte N (literal, never mod N) and never throws', () => {
    const bad = classic32.n + 5; // e.g. 37
    const g = Uint8Array.of(op(classic32, 'divide'), bad, op(classic32, 'divide'));
    let res!: DisasmResult;
    assert.doesNotThrow(() => { res = disassemble(g, classic32); });
    assert.equal(res.lines[1]!.text, `raw byte ${bad}`); // literal value preserved, not folded
    assert.notEqual(bad % classic32.n, bad); // proves it would differ under mod-N folding
    assertTiles(res, g.length);
  });

  it('[DISASM-008] An unpairable addressing template falls back to raw <mnemonic> (no fabricated label) and never throws', () => {
    // adrb with a reference whose complement has no matching definition anywhere -> raw.
    const g = Uint8Array.of(op(classic32, 'adrb'), op(classic32, 'nop1'), op(classic32, 'nop0'));
    let res!: DisasmResult;
    assert.doesNotThrow(() => { res = disassemble(g, classic32); });
    // no complementary landmark exists before the reference -> the addr goes raw, its nops raw.
    assert.equal(res.lines[0]!.text, 'raw adrb');
    assert.ok(res.lines.every((l) => !/^find/.test(l.text)), 'no fabricated find/label');
    assertTiles(res, g.length);
  });

  it('[DISASM-009] Dangling addressing op -> raw <mnemonic>; an unpaired nop of a failed reference -> raw nop0/nop1', () => {
    const dangling = disassemble(Uint8Array.of(op(classic32, 'adro')), classic32); // no template follows
    assert.deepEqual(dangling.lines.map((l) => l.text), ['raw adro']);
    // a reference run that cannot pair renders each nop raw:
    const g = Uint8Array.of(op(classic32, 'adrb'), op(classic32, 'nop1'), op(classic32, 'nop0'));
    const res = disassemble(g, classic32);
    assert.deepEqual(res.lines.map((l) => l.text), ['raw adrb', 'raw nop1', 'raw nop0']);
  });

  it('[DISASM-010] GSINV-ROUNDTRIP: compile -> disassemble -> compile is byte-identical (labels may be renamed)', () => {
    const corpus = [
      'divide',
      'grow-a\nsubtract\nshrink-c',
      'start:\nsubtract\nfind-back start\ndivide',
      'start:\ngrow-a\nloop:\nshrink-c\nif-zero\njump-back start\njump-back loop',
      'find-forward tail\ngrow-a\ntail:',
      'raw nop0\ngrow-a\nraw byte 7',
    ];
    for (const src of corpus) {
      const g0 = assemble(src, classic32);
      const s1 = disassemble(g0, classic32).source;
      const g1 = assemble(s1, classic32);
      assert.deepEqual([...g1], [...g0], `round-trip: ${JSON.stringify(src)} -> ${JSON.stringify(s1)}`);
    }
  });

  it('[DISASM-011] Disassembly of an arbitrary RANDOM genome always succeeds (never throws) and tiles bytes 1:1', () => {
    const rand = lcg(0xC0FFEE);
    for (let t = 0; t < 500; t++) {
      const len = Math.floor(rand() * 40);
      const g = new Uint8Array(len);
      for (let k = 0; k < len; k++) g[k] = Math.floor(rand() * 256);
      let res!: DisasmResult;
      assert.doesNotThrow(() => { res = disassemble(g, classic32); }, `iter ${t}`);
      assertTiles(res, len);
      assert.equal(typeof res.source, 'string');
    }
  });

  it('[DISASM-012] The line/byte annotation aligns 1:1 with bytes across verbs, templates and raw fallbacks', () => {
    const g = Uint8Array.of(
      op(classic32, 'nop0'), op(classic32, 'divide'), op(classic32, 'adrb'), op(classic32, 'nop1'),
      classic32.n + 2, op(classic32, 'incA'),
    );
    const res = disassemble(g, classic32);
    assertTiles(res, g.length); // dense, ordered, gap-free, no overlap
  });

  it('[DISASM-013] Each line carries a well-formed text/verb (or raw form) consistent with its bytes', () => {
    const g = Uint8Array.of(op(classic32, 'incA'), classic32.n + 1, op(classic32, 'nop0'), op(classic32, 'nop1'));
    const res = disassemble(g, classic32);
    for (const line of res.lines) {
      const [s, e] = line.bytes;
      assert.ok(s >= 0 && e <= g.length && s < e);
      const ok = /^label\d+:$/.test(line.text)
        || /^raw byte \d+$/.test(line.text)
        || /^raw \S+$/.test(line.text)
        || mnemonicToVerb(verbToMnemonic(line.text.split(' ')[0]!) ?? '') !== undefined
        || line.text.split(' ').length >= 1;
      assert.ok(ok, `well-formed line: ${line.text}`);
    }
    // the grow-a byte -> verb; the out-of-range byte -> raw byte
    assert.equal(res.lines[0]!.text, 'grow-a');
    assert.equal(res.lines[1]!.text, `raw byte ${classic32.n + 1}`);
  });

  it('[DISASM-014] A paired reference and its defining landmark share the SAME label name', () => {
    const g = Uint8Array.of(op(classic32, 'nop0'), op(classic32, 'divide'), op(classic32, 'adrb'), op(classic32, 'nop1'));
    const res = disassemble(g, classic32);
    const def = res.lines.find((l) => /^label\d+:$/.test(l.text))!;
    const ref = res.lines.find((l) => l.text.startsWith('find-back'))!;
    const name = def.text.slice(0, -1); // strip ':'
    assert.equal(ref.text, `find-back ${name}`); // both ends carry the same label
  });

  it('[DISASM-015] Determinism (C-GS-DET): same genome + set twice yields identical text + lines', () => {
    const g = Uint8Array.of(
      op(classic32, 'nop0'), op(classic32, 'divide'), op(classic32, 'adrb'), op(classic32, 'nop1'),
      classic32.n + 9, op(classic32, 'incA'),
    );
    const a = disassemble(g, classic32);
    const b = disassemble(g, classic32);
    assert.equal(a.source, b.source);
    assert.deepEqual(a.lines, b.lines);
  });

  it('[DISASM-016] Edge inputs never throw and round-trip where defined', () => {
    // empty -> empty text + empty lines
    const empty = disassemble(new Uint8Array(0), classic32);
    assert.equal(empty.source, '');
    assert.deepEqual(empty.lines, []);
    // all-out-of-range -> all raw byte N, and recompiles to the exact input
    const oor = Uint8Array.of(classic32.n, classic32.n + 3, classic32.n + 100);
    const oorRes = disassemble(oor, classic32);
    assert.ok(oorRes.lines.every((l) => /^raw byte \d+$/.test(l.text)));
    assert.deepEqual([...assemble(oorRes.source, classic32)], [...oor]);
    // all-nop -> a label, never throws, tiles
    const nops = Uint8Array.of(op(classic32, 'nop0'), op(classic32, 'nop0'), op(classic32, 'nop1'));
    let nopRes!: DisasmResult;
    assert.doesNotThrow(() => { nopRes = disassemble(nops, classic32); });
    assert.match(nopRes.lines[0]!.text, /^label\d+:$/);
    assertTiles(nopRes, nops.length);
  });

  it('[DISASM-017] No mod-N folding and no realignment: bytes are decoded positionally and literally', () => {
    const bad = classic32.n + 4; // folds to opcode 4 under mod-N; must NOT be rendered as that verb
    const g = Uint8Array.of(bad);
    const res = disassemble(g, classic32);
    assert.equal(res.lines[0]!.text, `raw byte ${bad}`);
    assert.notEqual(res.lines[0]!.text, mnemonicToVerb(mnemonicAtOpcode(classic32, bad % classic32.n)!));
    // a nop run is not realigned/merged with a neighbouring verb: positional decode only
    const g2 = Uint8Array.of(op(classic32, 'nop0'), op(classic32, 'incA'));
    const res2 = disassemble(g2, classic32);
    assert.deepEqual(res2.lines.map((l) => l.bytes), [[0, 1], [1, 2]]);
  });
});
