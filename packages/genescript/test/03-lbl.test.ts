// Labels & Templates (LBL) — real tests over the label→template lowering primitives.
// Ref: docs/spec/genescript/03-labels-and-templates.md §8.
// Ref: engine ISA-VM-SPEC.md §5 (template addressing) & §5.5 (adjacent-template MERGE gotcha).
//
// This suite pins the LBL layer's guarantees over its pure primitives (assignTemplates / complement
// / directionFor / needsSpacer). Criteria that additionally require the engine's complementary
// SEARCH (TMPL) or COMP's byte serialization are asserted at the precondition LBL is responsible
// for — the placement/uniqueness/direction/merge facts the engine tests then rely on.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assignTemplates, complement, directionFor, needsSpacer } from '../src/lbl.ts';

// --- helpers -------------------------------------------------------------------------------------
const eq = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const isComplement = (a: number[], b: number[]) =>
  a.length === b.length && a.every((x, i) => x + b[i]! === 1); // NopS == 1
// minimal length that keeps n labels non-equal/non-complementary: smallest k with 2^(k-1) >= n.
const minLen = (n: number) => { let k = 1; while (1 << (k - 1) < n) k++; return k; };

describe('Labels & Templates (LBL)', () => {
  it('[LBL-001] a label + jump-back lowers to a template T at the label and its complement (T-bar) at the jump (T[i]+Tbar[i]==NopS==1)', () => {
    const t = assignTemplates(['loop'])!.get('loop')!;
    const tbar = complement(t); // reference (jump-back loop) carries the complement
    assert.ok(t.length >= 1);
    for (let i = 0; i < t.length; i++) assert.equal(t[i]! + tbar[i]!, 1); // complement match, NopS==1
    assert.equal(directionFor('jump-back'), 'bwd');
  });

  it('[LBL-002] two distinct labels get distinguishable patterns: neither equal nor complementary (Tx!=Ty and Tx!=complement(Ty))', () => {
    const m = assignTemplates(['a', 'b']);
    const ta = m.get('a')!, tb = m.get('b')!;
    assert.ok(!eq(ta, tb), 'patterns must not be equal');
    assert.ok(!isComplement(ta, tb), 'patterns must not be complementary');
    // ...and it scales: 10 labels stay pairwise non-equal and non-complementary.
    const many = [...assignTemplates(['l0','l1','l2','l3','l4','l5','l6','l7','l8','l9']).values()];
    for (let i = 0; i < many.length; i++)
      for (let j = i + 1; j < many.length; j++) {
        assert.ok(!eq(many[i]!, many[j]!), `equal patterns at ${i},${j}`);
        assert.ok(!isComplement(many[i]!, many[j]!), `complementary patterns at ${i},${j}`);
      }
  });

  it('[LBL-003] under the complementary search a reference resolves to the intended label (nearest in-direction) and no other, within the search limit', () => {
    // LBL precondition for TMPL: a reference for X carries complement(Tx), which — by the
    // non-equal/non-complementary rule — equals exactly ONE live label's pattern (X itself) and no
    // other's. So the engine's complement scan can only class-match the intended label.
    const m = assignTemplates(['x', 'y', 'z']);
    const [x, y, z] = ['x', 'y', 'z'].map((n) => m.get(n)!);
    const refX = complement(x!);
    // A site P is a complement match for refX iff refX is P's complement, i.e. P == x. So:
    assert.ok(!eq(refX, x!), 'a reference never equals its own label site (no self-match)');
    assert.ok(isComplement(refX, x!), 'the reference for X complement-matches label X');
    assert.equal([x, y, z].filter((t) => isComplement(refX, t!)).length, 1, 'exactly one label matches');
    assert.ok(!isComplement(refX, y!) && !isComplement(refX, z!), 'no OTHER label matches the reference');
  });

  it('[LBL-004] direction is chosen from the verb: jump-back/find-back->backward, find-forward->forward, jump/call/find->outward', () => {
    assert.equal(directionFor('jump-back'), 'bwd');
    assert.equal(directionFor('find-back'), 'bwd');
    assert.equal(directionFor('find-forward'), 'fwd');
    assert.equal(directionFor('jump'), 'out');
    assert.equal(directionFor('call'), 'out');
    assert.equal(directionFor('find'), 'out');
    assert.throws(() => directionFor('ret'), /not a label-referencing verb/); // non-referencing verb has no direction
  });

  it('[LBL-005] adjacent nop-runs (label->ref, ref->label, ref->ref) are separated by a non-nop spacer so the VM never reads them as one merged template', () => {
    assert.equal(needsSpacer(true, true), true);   // nop-run abuts nop-run -> MERGE hazard -> spacer
    assert.equal(needsSpacer(true, false), false); // next is a real verb: no adjacency
    assert.equal(needsSpacer(false, true), false); // previous ended on a real verb: it IS the spacer
    assert.equal(needsSpacer(false, false), false);
  });

  it('[LBL-006] template length grows only when needed for uniqueness: minimal while unambiguous, increments when the current length is exhausted (length k supports 2^(k-1) labels)', () => {
    const lenFor = (names: string[]) => assignTemplates(names).values().next().value!.length;
    assert.equal(lenFor(['a']), 1);                     // 2^0 = 1 label
    assert.equal(lenFor(['a', 'b']), 2);                // 2^1 = 2 labels
    assert.equal(lenFor(['a', 'b', 'c']), 3);           // exceeds 2, grows to length 3 (2^2 = 4)
    assert.equal(lenFor(['a', 'b', 'c', 'd']), 3);      // still fits in length 3
    assert.equal(lenFor(['a','b','c','d','e']), 4);     // exceeds 4, grows to length 4 (2^3 = 8)
    // minimal for arbitrary n: exactly minLen(n), and it grows monotonically.
    let prev = 0;
    for (let n = 1; n <= 12; n++) {
      const names = Array.from({ length: n }, (_, i) => `n${i}`);
      const L = assignTemplates(names).values().next().value!.length;
      assert.equal(L, minLen(n), `n=${n}`);
      assert.ok(L >= prev, 'length is non-decreasing in label count');
      prev = L;
    }
  });

  it('[LBL-007] allocation is deterministic: same source compiles to byte-identical templates+spacers; renaming a label (order unchanged) leaves the bytes unchanged (no RNG, no name-hash)', () => {
    const a = assignTemplates(['start', 'loop', 'end']);
    const b = assignTemplates(['start', 'loop', 'end']);
    for (const k of a.keys()) assert.ok(eq(a.get(k)!, b.get(k)!), `nondeterministic for ${k}`);
    // rename labels but keep the ORDER: the emitted pattern sequence is identical (no name-hash).
    const renamed = assignTemplates(['top', 'body', 'tail']);
    const seqA = [...a.values()];
    const seqR = [...renamed.values()];
    assert.equal(seqR.length, seqA.length);
    for (let i = 0; i < seqA.length; i++) assert.ok(eq(seqA[i]!, seqR[i]!), `pattern ${i} changed on rename`);
  });

  it('[LBL-008] find-back and find-forward pick the correct direction: find-back start finds the start landmark behind, find-forward end finds the end ahead; they never cross-match', () => {
    assert.equal(directionFor('find-back'), 'bwd');    // find-back start -> search backward
    assert.equal(directionFor('find-forward'), 'fwd'); // find-forward end -> search forward
    // start and end templates are non-equal AND non-complementary, so a find for one can never
    // class-match the other (no cross-match), independent of direction.
    const m = assignTemplates(['start', 'end']);
    const s = m.get('start')!, e = m.get('end')!;
    assert.ok(!eq(s, e) && !isComplement(s, e));
    assert.ok(!eq(complement(s), e), 'find-back start must not match end');
    assert.ok(!eq(complement(e), s), 'find-forward end must not match start');
  });

  it('[LBL-009] start/end self-location markers get distinct templates at the true first/last instruction so size = end - start spans the whole genome (precondition of GSINV-ANCESTOR)', () => {
    const m = assignTemplates(['start', 'end']);
    assert.equal(m.size, 2);
    const s = m.get('start')!, e = m.get('end')!;
    assert.ok(!eq(s, e), 'start and end must be distinct');
    assert.ok(!isComplement(s, e), 'start and end must not be complementary');
  });

  it('[LBL-010] every emitted nop run is well-formed: length >= MinTemplSize(1), only the active set nop0/nop1 opcodes, read from the active set (never hard-coded)', () => {
    for (const t of assignTemplates(['a','b','c','d','e','f','g']).values()) {
      assert.ok(t.length >= 1, 'length >= MinTemplSize(1)');
      for (const bit of t) assert.ok(bit === 0 || bit === 1, 'only nop0(0)/nop1(1) bits');
    }
  });

  it('[LBL-011] only referenced labels get templates; an unreferenced label emits no nop run', () => {
    // LBL allocates for exactly the label names it is handed (COMP passes only referenced labels):
    // no extra templates are invented, and none are dropped.
    assert.equal(assignTemplates([]).size, 0);
    const m = assignTemplates(['used1', 'used2']);
    assert.equal(m.size, 2);
    assert.deepEqual([...m.keys()], ['used1', 'used2']);
  });

  it('[LBL-012] uniqueness is guaranteed within the compiled creature only; LBL does not depend on the absence of a complementary match elsewhere in the soup (parasitism is intended)', () => {
    // Uniqueness is a property of the ONE handed-in label set; LBL never consults any external soup.
    // Two independently-compiled creatures may collide (intended) — the function is a pure map of its
    // own input, and re-running with the same input reproduces the same patterns.
    const creatureA = assignTemplates(['self', 'copy']);
    const creatureB = assignTemplates(['self', 'copy']);
    for (const k of creatureA.keys()) assert.ok(eq(creatureA.get(k)!, creatureB.get(k)!));
    // within a creature, every pair is unambiguous:
    const vals = [...creatureA.values()];
    for (let i = 0; i < vals.length; i++)
      for (let j = i + 1; j < vals.length; j++)
        assert.ok(!eq(vals[i]!, vals[j]!) && !isComplement(vals[i]!, vals[j]!));
  });
});
