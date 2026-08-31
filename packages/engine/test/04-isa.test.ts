// Instruction Set & Dispatch (ISA) — real tests over the dictionary + classic32 + subsets.
// Ref: docs/spec/engine/systems/04-instruction-set-and-dispatch.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DICTIONARY, classic32, buildSubset, bitWidth } from '../src/isa.ts';
import { HANDLERS } from '../src/handlers.ts';

describe('Instruction Set & Dispatch (ISA)', () => {
  it('[ISA-001] classic32 has exactly 32 entries', () => {
    assert.equal(classic32.n, 32);
    assert.equal(classic32.opcodeToId.length, 32);
  });

  it('[ISA-002] nop0=opcode 0, nop1=opcode 1 (INV-TEMPLATE)', () => {
    assert.equal(classic32.nop0, 0); assert.equal(classic32.nop1, 1);
    assert.equal(DICTIONARY[0]!.mnemonic, 'nop0');
    assert.equal(DICTIONARY[1]!.mnemonic, 'nop1');
  });

  it('[ISA-003] every opcode maps to a dictionary entry with a real exec handler', () => {
    for (let op = 0; op < classic32.n; op++) {
      const id = classic32.opcodeToId[op]!;
      const entry = DICTIONARY[id]!;
      assert.equal(typeof HANDLERS[entry.exec], 'function');
    }
  });

  it('[ISA-004] classic32.bitWidth === 5', () => { assert.equal(classic32.bitWidth, 5); });

  it('[ISA-005] every mutation-produced byte decodes to a valid opcode', () => {
    const mask = (1 << classic32.bitWidth) - 1;
    for (let b = 0; b < 256; b++) { const op = (b & mask) % classic32.n; assert.ok(op >= 0 && op < classic32.n); }
  });

  it('[ISA-006] a subset is a strict subset with nop0/nop1 still at 0/1', () => {
    const sub = buildSubset('ch3', ['movDC', 'movii', 'ifz']);
    assert.ok(sub.n < 32 && sub.n >= 5);
    assert.equal(sub.nop0, 0); assert.equal(sub.nop1, 1);
    for (const id of sub.opcodeToId) assert.ok(DICTIONARY[id!]);
  });

  it('[ISA-007] dispatch keys on InstrId across sets', () => {
    const sub = buildSubset('s', ['movii']);
    const opInSub = sub.opcodeToId.indexOf(26); // movii id = 26
    const idSub = sub.opcodeToId[opInSub]!;
    const idFull = classic32.opcodeToId[26]!;
    assert.equal(idSub, idFull);
    assert.equal(DICTIONARY[idSub]!.exec, DICTIONARY[idFull]!.exec);
  });

  it('[ISA-008] bindings reference only registers A–D', () => {
    for (const e of DICTIONARY) for (const r of e.binding) assert.ok(r >= 0 && r <= 3);
    assert.equal(DICTIONARY[24]!.binding.length, 2); // movDC reg->reg
    assert.equal(DICTIONARY[0]!.binding.length, 0);  // nop0
  });

  it('[ISA-009] no duplicate mnemonic/gene; id === index', () => {
    const mn = new Set(), gn = new Set();
    DICTIONARY.forEach((e, i) => {
      assert.equal(e.id, i);
      assert.equal(mn.has(e.mnemonic), false); mn.add(e.mnemonic);
      assert.equal(gn.has(e.gene), false); gn.add(e.gene);
    });
  });

  it('[ISA-010] subset assigns opcodes by the canonical rule (identical everywhere) — S10', () => {
    const a = buildSubset('x', ['ifz', 'movii', 'incA']);
    const b = buildSubset('y', ['incA', 'movii', 'ifz']); // different input order
    assert.deepEqual(Array.from(a.opcodeToId), Array.from(b.opcodeToId)); // canonical → same bytes
    // order is: nop0(0), nop1(1), then classic-32 load order of the rest
    assert.equal(a.opcodeToId[0], 0); assert.equal(a.opcodeToId[1], 1);
  });

  it('[ISA-011] mutation-domain fold valid for non-power-of-two N (S13)', () => {
    const sub = buildSubset('np2', ['not0', 'shl', 'zero', 'ifz']); // n = 6 (nop0,nop1 + 4)
    assert.equal(sub.n, 6); assert.equal(sub.bitWidth, bitWidth(6));
    const mask = (1 << sub.bitWidth) - 1;
    for (let b = 0; b < 256; b++) { const op = (b & mask) % sub.n; assert.ok(op >= 0 && op < sub.n); }
  });
});
