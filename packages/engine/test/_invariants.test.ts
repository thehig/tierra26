// Global engine invariants — cross-system properties that must hold at all times.
// Ref: docs/spec/engine/systems/00-architecture.md §5 (INV-*).
// Pending until the engine exists; encoded as node:test todo tests (spec-as-checklist).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Global invariants (INV)', () => {
  it.todo('[INV-MEM] occupied cell intervals never overlap');
  it.todo('[INV-MEM] Σ(cell sizes) + free space == soupSize at all times');
  it.todo('[INV-QUEUE] every live creature is in exactly one slicer position');
  it.todo('[INV-QUEUE] every live creature is in exactly one reaper position');
  it.todo('[INV-QUEUE] dead creatures are in neither queue');
  it.todo('[INV-DET] two engines with the same RunDescriptor yield identical snapshots at every checkpoint');
  it.todo('[INV-REPLAY] Engine.replay(desc) digest equals the live-run digest');
  it.todo('[INV-ROUNDTRIP] restore(snapshot(e)) continues bit-identically for N cycles');
  it.todo('[INV-TEMPLATE] nop0/nop1 are opcodes 0/1 in every active set; complement match uses NopS==1');
  it.todo('[INV-INT] register arithmetic wraps as signed 32-bit');
});
