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

  it.todo('[TMPL-006] a miss beyond searchLimit sets E, advances IP past own template, leaves regs (needs world)');
  it.todo('[TMPL-008] adr writes A/C; jmp loads IP; call pushes return (needs world/handlers)');
  it.todo('[TMPL-011] searchLimit = floor(mult * integer avgSize), stable across snapshot (needs world)');
});
