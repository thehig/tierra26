// Creature lifecycle & reproduction (REPRO) — mal -> copy loop -> divide, the 0.7 gate, birth.
// Ref: docs/spec/engine/systems/08-creature-lifecycle-and-reproduction.md §8 (REPRO-*).
// Companion pending-test file. Node reports it.todo as `# todo`, so the suite is green pre-impl.
// Do NOT import engine src/ (it does not exist yet — an import error would fail the file).
// When the module lands, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Reproduction (REPRO)', () => {
  // --- mal: allocate the daughter ---
  it.todo('[REPRO-001] mal with a valid size allocates a daughter and returns its start in register A');
  it.todo('[REPRO-002] after mal the daughter block is write-protected to the mother and to no other creature');
  it.todo('[REPRO-003] mal with size below MinCellSize (12) fails: sets E, allocates nothing, leaves A unchanged');
  it.todo('[REPRO-004] mal with size above maxCellSize fails: sets E and allocates nothing');
  it.todo('[REPRO-005] a second mal before divide frees the prior undivided daughter and resets dauWritten/dauWriteMask');

  // --- copy loop: distinct-byte fill tracking (dauWriteMask) ---
  it.todo('[REPRO-006] a movii into the daughter increments dauWritten and sets the dauWriteMask bit for that byte');
  it.todo('[REPRO-007] rewriting an already-written daughter byte does NOT advance dauWritten (the 0.7 gate cannot be cheated)');
  // FIXME: markDaughterWrite must use ad(addr)-dauStart so a wrap-spanning daughter counts correctly.
  it.todo('[REPRO-008] a movii outside both the mother cell and the daughter block is denied, sets E, writes nothing, and does not count');

  // --- divide: the 0.7 gate ---
  it.todo('[REPRO-009] divide with no allocated daughter (dauStart < 0) fails and sets E');
  it.todo('[REPRO-010] divide before the daughter is >= MovPropThrDiv (0.7) filled fails, sets E, and does not mutate daughter fields');
  // FIXME: gate is integer (dauWritten*10 >= dauSize*7), never a float compare (C-INT / determinism).
  it.todo('[REPRO-011] the 0.7 gate is integer: for a size-80 daughter, 55 distinct bytes fail and 56 pass');

  // --- divide: birth of an independent creature ---
  it.todo('[REPRO-012] divide at >= 0.7 fill creates an independent creature over [dauStart,dauSize) enqueued in BOTH the slicer and reaper queues');
  it.todo('[REPRO-013] the daughter creature gets a fresh zeroed CPU with IP at its OWN start address, not the mother\'s');
  it.todo('[REPRO-014] the daughter gets a monotonic id (nextId++), parentId = mother.id, and bornAtCycle = current cycle');
  it.todo('[REPRO-015] a successful divide fires the genebank birth hook for the daughter');
  it.todo('[REPRO-016] a successful divide moves the mother DOWN the reaper queue and increments world.births');
  it.todo('[REPRO-017] after a successful divide the mother\'s daughter fields are cleared (dauStart=-1, dauSize=0, dauWritten=0, mask released)');

  // --- end-to-end: the canonical ancestor breeds true ---
  it.todo('[REPRO-018] the canonical 0080aaa self-replication sequence (locate -> mal -> copy -> divide) with mutation off yields a byte-identical, sterile daughter');
});
