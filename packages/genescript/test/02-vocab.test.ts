// Vocabulary & Keywords (VOCAB) — real tests over the engine-derived verb table.
// Ref: docs/spec/genescript/02-vocabulary-and-keywords.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VOCAB, verbToMnemonic, isControlVerb, takesTarget } from '../src/vocab.ts';
import { DICTIONARY } from '../../engine/src/isa.ts';

describe('Vocabulary & Keywords (VOCAB)', () => {
  it('[VOCAB-001] exactly 32 entries', () => { assert.equal(VOCAB.length, 32); });

  it('[VOCAB-002] bijection with classic-32 mnemonics', () => {
    const mns = new Set(VOCAB.map((v) => v.mnemonic));
    assert.equal(mns.size, 32);
    for (const e of DICTIONARY) assert.ok(mns.has(e.mnemonic));
  });

  it('[VOCAB-003] all verb strings are unique', () => {
    assert.equal(new Set(VOCAB.map((v) => v.verb)).size, 32);
  });

  it('[VOCAB-004] every mnemonic is a real engine instruction', () => {
    const real = new Set(DICTIONARY.map((e) => e.mnemonic));
    for (const v of VOCAB) assert.ok(real.has(v.mnemonic));
  });

  it('[VOCAB-005] verbs ending -a/-b/-c/-d carry the register matching the engine binding dest', () => {
    for (const v of VOCAB) {
      const m = /-([abcd])$/.exec(v.verb);
      if (m) {
        assert.equal(v.register, m[1]!.toUpperCase());
        const dict = DICTIONARY.find((e) => e.mnemonic === v.mnemonic)!;
        assert.equal(dict.binding[0], 'abcd'.indexOf(m[1]!)); // dest register index
      }
    }
  });

  it('[VOCAB-006] register-specific families are exactly the specified set', () => {
    const reg = VOCAB.filter((v) => v.category === 'register').map((v) => v.verb).sort();
    assert.deepEqual(reg, [
      'copy-a-to-b', 'copy-c-to-d', 'grow-a', 'grow-b', 'grow-c', 'load-a', 'load-b', 'load-c', 'load-d',
      'save-a', 'save-b', 'save-c', 'save-d', 'shrink-c', 'subtract', 'subtract-into-a',
    ].sort());
  });

  it('[VOCAB-007] nop0/nop1 are the only markers: mark-0/mark-1', () => {
    const markers = VOCAB.filter((v) => v.category === 'marker');
    assert.deepEqual(markers.map((v) => v.verb).sort(), ['mark-0', 'mark-1']);
    assert.deepEqual(markers.map((v) => v.mnemonic).sort(), ['nop0', 'nop1']);
  });

  it('[VOCAB-008] every kid tooltip is plain (no cryptic mnemonic, no "opcode")', () => {
    // exclude mnemonics that are also plain English words (zero/call/divide/ret)
    const english = new Set(['zero', 'call', 'divide', 'ret']);
    const cryptic = VOCAB.map((v) => v.mnemonic).filter((mn) => !english.has(mn));
    for (const v of VOCAB) {
      assert.ok(v.kid.length > 0);
      assert.equal(/opcode/i.test(v.kid), false);
      for (const mn of cryptic) assert.equal(v.kid.includes(mn), false, `kid mentions ${mn}`);
    }
  });

  it('[VOCAB-009] every machine tooltip is non-empty', () => {
    for (const v of VOCAB) assert.ok(v.machine.length > 0);
  });

  it('[VOCAB-010] categories valid; all flow ops are control', () => {
    const flow = ['jmpo', 'jmpb', 'call', 'ret', 'ifz', 'adro', 'adrb', 'adrf', 'mal', 'divide'];
    for (const v of VOCAB) {
      assert.ok(['action', 'register', 'marker', 'control', 'value'].includes(v.category));
      if (flow.includes(v.mnemonic)) assert.equal(v.category, 'control', `${v.mnemonic} should be control`);
    }
  });

  it('[VOCAB-011] no entry exposes an opcode number (only a mnemonic string)', () => {
    for (const v of VOCAB) {
      assert.equal(typeof v.mnemonic, 'string');
      assert.equal('opcode' in (v as any), false);
    }
  });

  it('[VOCAB-012] register usage references only A-D', () => {
    for (const v of VOCAB) if (v.register) assert.ok(['A', 'B', 'C', 'D'].includes(v.register));
  });

  it('[VOCAB-013] presentation order matches engine load order (0-31)', () => {
    assert.deepEqual(VOCAB.map((v) => v.mnemonic), DICTIONARY.map((e) => e.mnemonic));
  });

  it('[helpers] verbToMnemonic / isControlVerb / takesTarget', () => {
    assert.equal(verbToMnemonic('copy-byte'), 'movii');
    assert.equal(isControlVerb('jump'), true);
    assert.equal(takesTarget('jump'), true);
    assert.equal(takesTarget('divide'), false);
  });
});
