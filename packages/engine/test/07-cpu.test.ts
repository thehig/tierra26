// CPU & Execution Cycle (CPU) — registers/flags/stack + the fetch-decode-execute loop.
// Ref: docs/spec/engine/systems/07-cpu-and-execution-cycle.md §8 (CPU-001..CPU-008).
// Upstream: ISA-VM-SPEC.md §2.1/§2.4/§2.6; M0-TECH-DESIGN.md §4/§6.
// Pending until the engine exists; encoded as node:test todo tests (spec-as-checklist).
// Do NOT import engine src/ yet (modules don't exist — an import error would fail the file).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('CPU & Execution Cycle (CPU)', () => {
  it.todo('[CPU-001] register arithmetic wraps signed 32-bit: incA at A=0x7FFFFFFF yields A=-2147483648 (Int32Array, C-INT)');
  it.todo('[CPU-002] IP advances by iip: default op -> IP+1; op that consumed an s-byte template -> IP+s+1');
  it.todo('[CPU-003] IP advance wraps mod soupSize: IP=soupSize-1 with iip=1 lands at 0 via ad() (C-ADDR)');
  it.todo('[CPU-004] a jump sets IP directly and suppresses auto-advance (decoded.ipWasSet), so IP == landing address');
  it.todo('[CPU-005] push past the top (sp==10) does not wrap; it refuses and raiseE sets flagE ([MOD]); depth stays 10');
  it.todo('[CPU-006] pop past the bottom (sp==0) does not wrap/return stale; it refuses and raiseE sets flagE ([MOD])');
  it.todo('[CPU-007] each executed instruction increments world.cycles by exactly 1, including ones that raiseE');
  it.todo('[CPU-008] raiseE(world, creature) sets flagE and increments errorCount (and moves creature up the reaper) (C-ERR)');
});
