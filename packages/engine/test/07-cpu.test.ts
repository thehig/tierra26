// CPU & Execution Cycle (CPU). Unit-testable criteria (registers/flags/ring stack) are real;
// the cycle-level ones (IP advance, jump, cycles++, raiseE, nop-clears-flags) need stepOne (world.ts)
// and remain pending until that module lands.
// Ref: docs/spec/engine/systems/07-cpu-and-execution-cycle.md §8.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeCpu, applyFlags, push, pop } from '../src/cpu.ts';

describe('CPU & Execution Cycle (CPU)', () => {
  it('[CPU-001] register arithmetic wraps signed 32-bit (Int32Array, C-INT)', () => {
    const cpu = makeCpu(0);
    cpu.reg[0] = 0x7fffffff;
    cpu.reg[0] = (cpu.reg[0]! + 1) | 0;   // incA at max
    assert.equal(cpu.reg[0], -2147483648);
  });

  it.todo('[CPU-002] IP advances by iip (default op -> IP+1; template op -> IP+s+1)');
  it.todo('[CPU-003] IP advance wraps mod soupSize via ad() (C-ADDR)');
  it.todo('[CPU-004] a jump sets IP directly and suppresses auto-advance (ipWasSet)');

  it('[CPU-005] push onto a full stack wraps the 10-slot ring, no fault (S22)', () => {
    const cpu = makeCpu(0);
    for (let i = 0; i < 10; i++) push(cpu, 100 + i); // fills, sp back to 0
    assert.equal(cpu.sp, 0);
    push(cpu, 999);                 // overwrites the oldest slot (index 0)
    assert.equal(cpu.stack[0], 999);
    assert.equal(cpu.flagE, false); // no fault
  });

  it('[CPU-006] pop from an empty stack wraps and returns a stale value, no fault (S22)', () => {
    const cpu = makeCpu(0);
    const v = pop(cpu);             // sp 0 -> 9, reads stale slot
    assert.equal(cpu.sp, 9);
    assert.equal(v, 0);
    assert.equal(cpu.flagE, false);
    // LIFO sanity: push then pop returns the value
    const c2 = makeCpu(0); push(c2, 5); push(c2, 6);
    assert.equal(pop(c2), 6); assert.equal(pop(c2), 5);
  });

  it('[CPU-007] each executed instruction increments world.cycles by 1', { todo: true }, () => {});

  it.todo('[CPU-008] raiseE sets flagE + errorCount and moves the creature up the reaper (needs world)');

  it('[CPU-009] applyFlags sets S/Z (0 -> Z, negative -> S)', () => {
    const cpu = makeCpu(0);
    applyFlags(cpu, 0);   assert.equal(cpu.flagZ, true);  assert.equal(cpu.flagS, false);
    applyFlags(cpu, -4);  assert.equal(cpu.flagZ, false); assert.equal(cpu.flagS, true);
    applyFlags(cpu, 7);   assert.equal(cpu.flagZ, false); assert.equal(cpu.flagS, false);
  });

  it.todo('[CPU-010] nop0/nop1 execute as no-ops that clear E/S/Z (needs handler/stepOne)');
});
