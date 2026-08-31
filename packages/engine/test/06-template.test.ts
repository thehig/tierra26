// Template Addressing (TMPL) — real tests of the complementary search (search-level criteria).
// Templates must be delimited by non-nop bytes (as in real genomes), so each soup is pre-filled
// with a non-nop filler and only intended nop-runs are written.
// The E/register consequences (TMPL-006/008) and searchLimit-from-avgSize (TMPL-011) are covered
// end-to-end by the ancestor acceptance test and remain pending as unit criteria.
// Ref: docs/spec/engine/systems/06-template-addressing.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Soup } from '../src/soup.ts';
import { search, templateLen } from '../src/template.ts';
import { World } from '../src/world.ts';
import { classic32 } from '../src/isa.ts';
import { DEFAULT_RATES } from '../src/mutation.ts';

function tworld() {
  return new World({ soupSize: 400, seed: 1, activeSet: classic32, minCellSize: 12, maxCellSize: 300, searchLimitMult: 5, sizeDependent: false, slicePow: 1, sliceSize: 25, reaperThreshold: 990, rates: DEFAULT_RATES });
}

const NOP0 = 0, NOP1 = 1, WALL = 9; // WALL = any non-nop opcode, delimits templates
function soup(size = 200) { const s = new Soup(size); s.bytes.fill(WALL); return s; }

describe('Template Addressing (TMPL)', () => {
  it('[TMPL-001] forward search finds the nearest complement ahead (lands just past it)', () => {
    const s = soup();
    s.write(11, NOP1); s.write(12, NOP0);   // template at ip+1 (ip=10), delimited by WALL at 13
    s.write(40, NOP0); s.write(41, NOP1);   // complement ahead
    const r = search(s, 10, 1, 100, NOP0, NOP1);
    assert.equal(r.found, true); assert.equal(r.size, 2); assert.equal(r.addr, 42);
  });

  it('[TMPL-002] backward search finds the nearest complement behind', () => {
    const s = soup();
    s.write(51, NOP1); s.write(52, NOP0);
    s.write(30, NOP0); s.write(31, NOP1);
    const r = search(s, 50, 2, 100, NOP0, NOP1);
    assert.equal(r.found, true); assert.equal(r.addr, 32);
  });

  it('[TMPL-003] outward finds the nearer hit (forward on tie)', () => {
    const s = soup();
    s.write(101, NOP1);                      // size-1 template at ip=100
    s.write(104, NOP0);                      // forward complement (distance 3)
    s.write(96, NOP0);                       // backward complement (distance ~3)
    const r = search(s, 100, 0, 50, NOP0, NOP1);
    assert.equal(r.found, true);
    assert.equal(r.addr, 105);               // forward landing ad(104+1) wins the tie
  });

  it('[TMPL-004] landing is just past the matched template', () => {
    const s = soup();
    s.write(6, NOP1); s.write(20, NOP0);
    const r = search(s, 5, 1, 100, NOP0, NOP1);
    assert.equal(r.addr, 21);
  });

  it('[TMPL-005] complementary match; identical template does NOT match', () => {
    const s = soup();
    s.write(11, NOP1); s.write(12, NOP1);    // template nop1,nop1
    s.write(40, NOP1); s.write(41, NOP1);    // identical → no match
    s.write(60, NOP0); s.write(61, NOP0);    // complement → match
    const r = search(s, 10, 1, 100, NOP0, NOP1);
    assert.equal(r.found, true); assert.equal(r.addr, 62);
  });

  it('[TMPL-007] search wraps around the soup ends via ad()', () => {
    const s = new Soup(50); s.bytes.fill(WALL);
    s.write(46, NOP1);                       // size-1 template at ip=45
    s.write(5, NOP0);                        // complement reached by wrapping forward
    const r = search(s, 45, 1, 60, NOP0, NOP1);
    assert.equal(r.found, true); assert.equal(r.addr, 6);
  });

  it('[TMPL-009] single nop is a legal template; s==0 is "no template"', () => {
    const s = soup();
    s.write(11, NOP1);
    assert.equal(templateLen(s, 11, NOP0, NOP1), 1);
    const r = search(s, 70, 1, 100, NOP0, NOP1); // byte at 71 is WALL → size 0
    assert.equal(r.found, false); assert.equal(r.size, 0);
  });

  it('[TMPL-010] adjacent nop runs merge into one longer template', () => {
    const s = soup();
    for (let i = 11; i <= 16; i++) s.write(i, i % 2 === 0 ? NOP0 : NOP1); // 6 back-to-back nops
    assert.equal(templateLen(s, 11, NOP0, NOP1), 6);
  });

  it('[TMPL-006] a miss sets E, advances IP past own template, leaves dest regs unchanged', () => {
    const w = tworld(); const c = w.creatures.get(w.spawn(new Uint8Array(60)))!;
    c.cpu.reg[0] = 111; c.cpu.reg[2] = 222; // A, C (adr dests)
    w.soup.bytes.fill(9); // no nops anywhere → no complement to find
    w.soup.write(c.start, 28);                 // adrb
    w.soup.write(c.start + 1, 1); w.soup.write(c.start + 2, 0); // template size 2
    w.soup.write(c.start + 3, 9);              // WALL
    c.cpu.ip = c.start; w.stepOne(c);
    assert.equal(c.cpu.flagE, true);
    assert.equal(c.cpu.ip, c.start + 3);       // advanced past own template (iip = 2+1)
    assert.equal(c.cpu.reg[0], 111); assert.equal(c.cpu.reg[2], 222); // regs unchanged
  });

  it('[TMPL-008] adr writes A:=addr, C:=size on a hit', () => {
    const w = tworld(); const c = w.creatures.get(w.spawn(new Uint8Array(80)))!;
    w.soup.bytes.fill(9);
    w.soup.write(c.start, 29);                  // adrf (forward)
    w.soup.write(c.start + 1, 1); w.soup.write(c.start + 2, 0); // template nop1,nop0
    w.soup.write(c.start + 3, 9);
    w.soup.write(c.start + 40, 0); w.soup.write(c.start + 41, 1); // complement ahead
    c.cpu.ip = c.start; w.stepOne(c);
    assert.equal(c.cpu.flagE, false);
    assert.equal(c.cpu.reg[0], w.soup.ad(c.start + 42)); // A := landing (just past)
    assert.equal(c.cpu.reg[2], 2);                       // C := template size
  });

  it('[TMPL-011] searchLimit = floor(mult * integer avgSize)', () => {
    const w = tworld();
    w.spawn(new Uint8Array(80)); w.spawn(new Uint8Array(40)); // avg 60
    assert.equal(w.avgSize(), 60);
    assert.equal((w as any).searchLimit, Math.floor(5 * 60));
    assert.ok(Number.isInteger((w as any).searchLimit));
  });
});
