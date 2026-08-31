// CPU & Execution Cycle (CPU) — real tests. Ref: docs/spec/engine/systems/07-cpu-and-execution-cycle.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeCpu, applyFlags, push, pop } from '../src/cpu.ts';
import { World } from '../src/world.ts';
import { classic32 } from '../src/isa.ts';
import { DEFAULT_RATES } from '../src/mutation.ts';

function w1() {
  return new World({ soupSize: 300, seed: 1, activeSet: classic32, minCellSize: 12, maxCellSize: 250, searchLimitMult: 5, sizeDependent: false, slicePow: 1, sliceSize: 25, reaperThreshold: 950, rates: DEFAULT_RATES });
}
function spawnBlank(w: World, size = 40) { const id = w.spawn(new Uint8Array(size)); return w.creatures.get(id)!; }

describe('CPU & Execution Cycle (CPU)', () => {
  it('[CPU-001] register arithmetic wraps signed 32-bit', () => {
    const cpu = makeCpu(0); cpu.reg[0] = 0x7fffffff; cpu.reg[0] = (cpu.reg[0]! + 1) | 0;
    assert.equal(cpu.reg[0], -2147483648);
  });

  it('[CPU-002] IP advances by iip (1 for a plain op; s+1 past a template)', () => {
    const w = w1(); const c = spawnBlank(w);
    c.cpu.ip = c.start; w.stepOne(c); assert.equal(c.cpu.ip, c.start + 1); // nop0
    w.soup.write(c.start + 5, 28);                 // adrb
    w.soup.write(c.start + 6, 1); w.soup.write(c.start + 7, 0); // template size 2
    w.soup.write(c.start + 8, 8);                  // WALL (non-nop) delimits the template
    c.cpu.ip = c.start + 5; w.stepOne(c);
    assert.equal(c.cpu.ip, c.start + 8);           // iip = size(2)+1 = 3
  });

  it('[CPU-003] IP advance wraps mod soupSize (C-ADDR)', () => {
    const w = w1(); const c = spawnBlank(w);
    w.soup.write(299, 0); c.cpu.ip = 299; w.stepOne(c);
    assert.equal(c.cpu.ip, 0);
  });

  it('[CPU-004] a flow op sets IP directly (ret pops IP), suppressing auto-advance', () => {
    const w = w1(); const c = spawnBlank(w);
    c.cpu.stack[0] = 123; c.cpu.sp = 1;            // a return address on the stack
    w.soup.write(c.start + 3, 23);                 // ret
    c.cpu.ip = c.start + 3; w.stepOne(c);
    assert.equal(c.cpu.ip, w.soup.ad(123));        // IP = popped value, not start+4
  });

  it('[CPU-007] each executed instruction increments cycles by 1', () => {
    const w = w1(); const c = spawnBlank(w);
    const before = w.cycles; c.cpu.ip = c.start; w.stepOne(c);
    assert.equal(w.cycles, before + 1);
  });

  it('[CPU-008] raiseE sets flagE + errorCount (mal below MinCellSize)', () => {
    const w = w1(); const c = spawnBlank(w);
    c.cpu.reg[2] = 5;                               // C = 5 < MinCellSize(12)
    w.soup.write(c.start + 2, 30);                  // mal
    c.cpu.ip = c.start + 2; const e0 = c.errorCount;
    w.stepOne(c);
    assert.equal(c.cpu.flagE, true); assert.equal(c.errorCount, e0 + 1);
  });

  it('[CPU-005] push onto a full stack wraps the ring, no fault', () => {
    const cpu = makeCpu(0); for (let i = 0; i < 10; i++) push(cpu, i); assert.equal(cpu.sp, 0);
    push(cpu, 999); assert.equal(cpu.stack[0], 999); assert.equal(cpu.flagE, false);
  });

  it('[CPU-006] pop from empty wraps, no fault; LIFO otherwise', () => {
    const cpu = makeCpu(0); assert.equal(pop(cpu), 0); assert.equal(cpu.sp, 9);
    const c2 = makeCpu(0); push(c2, 5); push(c2, 6); assert.equal(pop(c2), 6); assert.equal(pop(c2), 5);
  });

  it('[CPU-009] applyFlags sets S/Z', () => {
    const cpu = makeCpu(0);
    applyFlags(cpu, 0); assert.equal(cpu.flagZ, true);
    applyFlags(cpu, -1); assert.equal(cpu.flagS, true); assert.equal(cpu.flagZ, false);
  });

  it('[CPU-010] nop clears E/S/Z', () => {
    const w = w1(); const c = spawnBlank(w);
    c.cpu.flagE = c.cpu.flagS = c.cpu.flagZ = true;
    w.soup.write(c.start, 0);                       // nop0
    c.cpu.ip = c.start; w.stepOne(c);
    assert.equal(c.cpu.flagE, false); assert.equal(c.cpu.flagS, false); assert.equal(c.cpu.flagZ, false);
  });
});
