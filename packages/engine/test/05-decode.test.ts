// Decode & Operands (DEC) — real tests over world.decoded after a step. Ref: systems/05 §8.
// NOTE: this engine stages template SEARCH in the handler (not fwd/bwd start points in decode);
// DEC-013's fwd/bwd-start staging is not part of this design and stays pending.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.ts';
import { classic32 } from '../src/isa.ts';
import { DEFAULT_RATES } from '../src/mutation.ts';

function w1() {
  return new World({ soupSize: 300, seed: 1, activeSet: classic32, minCellSize: 12, maxCellSize: 250, searchLimitMult: 5, sizeDependent: false, slicePow: 1, sliceSize: 25, reaperThreshold: 990, rates: DEFAULT_RATES });
}
const spawn = (w: World, size = 40) => w.creatures.get(w.spawn(new Uint8Array(size)))!;
// write opcode + optional trailing bytes at the creature start, set ip there, step, return world.decoded
function decodeOf(w: World, c: any, opcode: number, trailing: number[] = []) {
  w.soup.write(c.start, opcode);
  trailing.forEach((b, i) => w.soup.write(c.start + 1 + i, b));
  c.cpu.ip = c.start; w.stepOne(c); return w.decoded;
}

describe('Decode & Operands (DEC)', () => {
  it('[DEC-001] world.decoded is one reused instance', () => {
    const w = w1(); const c = spawn(w); const d1 = decodeOf(w, c, 0); const d2 = decodeOf(w, c, 0);
    assert.equal(d1, d2); // same object reference
  });

  it('[DEC-002/009] iip defaults to 1 before decode; a plain op advances IP by 1', () => {
    const w = w1(); const c = spawn(w); const d = decodeOf(w, c, 8); // incA
    assert.equal(d.iip, 1);
  });

  it('[DEC-003] pnop-kind (nop) sets no operands: dstIdx==-1, iip==1', () => {
    const w = w1(); const c = spawn(w); const d = decodeOf(w, c, 0);
    assert.equal(d.dstIdx, -1); assert.equal(d.iip, 1);
  });

  it('[DEC-004] single-dest opcodes resolve to their bound register', () => {
    const w = w1(); const c = spawn(w);
    assert.equal(decodeOf(w, c, 8).dstIdx, 0);  // incA → A
    assert.equal(decodeOf(w, c, 9).dstIdx, 1);  // incB → B
    assert.equal(decodeOf(w, c, 2).dstIdx, 2);  // not0 → C
  });

  it('[DEC-005] SUB3 stages dst + two sources', () => {
    const w = w1(); const c = spawn(w); c.cpu.reg[0] = 9; c.cpu.reg[1] = 4; c.cpu.reg[2] = 3;
    const d = decodeOf(w, c, 6); // subCAB: dst=C, sval=A, sval2=B
    assert.equal(d.dstIdx, 2); assert.equal(d.sval, 9); assert.equal(d.sval2, 4);
  });

  it('[DEC-006] PUSH stages sval from the bound reg; dstIdx==-1', () => {
    const w = w1(); const c = spawn(w); c.cpu.reg[0] = 77;
    const d = decodeOf(w, c, 12); // pushA
    assert.equal(d.sval, 77); assert.equal(d.dstIdx, -1);
  });

  it('[DEC-007] MOV2 stages both dst and src', () => {
    const w = w1(); const c = spawn(w); c.cpu.reg[2] = 55;
    const d = decodeOf(w, c, 24); // movDC: dst=D, sval=C
    assert.equal(d.dstIdx, 3); assert.equal(d.sval, 55);
  });

  it('[DEC-008] ifz sets iip=2 when C!=0 (skip), iip=1 when C==0 (run next)', () => {
    const w = w1(); const c = spawn(w);
    c.cpu.reg[2] = 5; assert.equal(decodeOf(w, c, 5).iip, 2); // C!=0 → skip
    c.cpu.reg[2] = 0; assert.equal(decodeOf(w, c, 5).iip, 1); // C==0 → run next
  });

  it('[DEC-010] addressing decode sets iip == templateSize+1', () => {
    const w = w1(); const c = spawn(w);
    const d = decodeOf(w, c, 28, [1, 0, 8]); // adrb, template nop1,nop0 (size 2), WALL 8
    assert.equal(d.iip, 3); assert.equal(d.tplSize, 2);
  });

  it('[DEC-011] no leakage: sval2/tplSize reset for an op that does not set them', () => {
    const w = w1(); const c = spawn(w); c.cpu.reg[1] = 3;
    decodeOf(w, c, 6, [0, 0]); // sub sets sval2
    const d = decodeOf(w, c, 0); // nop: should leave defaults
    assert.equal(d.sval2, 0); assert.equal(d.tplSize, 0);
  });

  it('[DEC-014] movii resolves both operands indirectly; iip==1, dstIdx==-1', () => {
    const w = w1(); const c = spawn(w); c.cpu.reg[0] = 111; c.cpu.reg[1] = 222;
    const d = decodeOf(w, c, 26); // movii → but writing may E; decode still stages addrs
    assert.equal(d.dstAddr, w.soup.ad(111)); assert.equal(d.srcAddr, w.soup.ad(222)); assert.equal(d.iip, 1);
  });

  it('[DEC-015] mal stages dstReg=A and sval=regC', () => {
    const w = w1(); const c = spawn(w); c.cpu.reg[2] = 40;
    const d = decodeOf(w, c, 30); // mal
    assert.equal(d.dstIdx, 0); assert.equal(d.sval, 40);
  });

  it('[DEC-016] classic32 uses fixed bindings only (no toggle index)', () => {
    const w = w1(); const c = spawn(w);
    // incA always binds A regardless of any hypothetical toggle state
    assert.equal(decodeOf(w, c, 8).dstIdx, 0);
    assert.equal(decodeOf(w, c, 8).dstIdx, 0);
  });

  it('[DEC-017] flaw hook is identity at rate 0: staged sval equals the exact register value', () => {
    const w = w1(); const c = spawn(w); c.cpu.reg[0] = 12345; c.cpu.reg[1] = -9;
    const d = decodeOf(w, c, 6); // subCAB sources A,B
    assert.equal(d.sval, 12345); assert.equal(d.sval2, -9);
  });

  it.todo('[DEC-012] decadr/decjmp binding detail (adr writes A; jmp targets IP) — exercised via handler/acceptance');
  it.todo('[DEC-013] fwd/bwd template start staging — not part of this design (search staged in handler)');
});
