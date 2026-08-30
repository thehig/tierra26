// Allocator (ALLOC) — daughter-cell allocation over the soup's free space.
// Ref: docs/spec/engine/systems/03-allocator.md §8 (acceptance criteria ALLOC-001..013).
// Pending until the engine exists; encoded as node:test todo tests (spec-as-checklist).
// Do NOT import engine src/ modules yet (they don't exist — an import would fail the file).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Allocator (ALLOC)', () => {
  // --- first-fit gap selection ---
  it.todo(
    '[ALLOC-001] findFree picks the earliest (leftmost) gap that fits when several gaps qualify',
  );
  it.todo(
    '[ALLOC-002] findFree selects an exact-fit gap (gapWidth == size) and leaves zero slack after reserve',
  );
  it.todo(
    '[ALLOC-003] findFree returns -1 when no single gap is >= size, even if total fragmented free >= size',
  );
  it.todo(
    '[ALLOC-004] findFree on an empty soup returns 0 for size <= soupSize and -1 for size > soupSize',
  );

  // --- reap-to-make-room (mal into a full soup) ---
  it.todo(
    '[ALLOC-005] mal into a full soup kills the reaper-queue head to free space, then reserves the daughter in freed space',
  );
  it.todo(
    '[ALLOC-006] mal fails (sets E, leaves occupied intervals and register A unchanged) when reaping cannot free enough (queue empty / at floor)',
  );

  // --- free & coalesce ---
  it.todo(
    '[ALLOC-007] freeing an interval between two others coalesces into one contiguous gap that a spanning findFree can then satisfy',
  );

  // --- interval integrity (INV-MEM) ---
  it.todo(
    '[ALLOC-008] after arbitrary reserve/free churn, intervals() stay sorted & non-overlapping and occupancy()+freeSpace()==soupSize',
  );

  // --- validation / rejection ---
  it.todo(
    '[ALLOC-009] mal with size < MinCellSize (12) sets E, allocates nothing, and leaves daughter fields and A unchanged',
  );
  it.todo(
    '[ALLOC-010] mal with size > MaxMalMult*motherSize (or > maxCellSize) sets E and allocates nothing',
  );

  // --- daughter bookkeeping ---
  it.todo(
    '[ALLOC-011] a second mal before divide frees the prior undivided daughter first (no leak, no double-reserve), then places the new one',
  );
  it.todo(
    '[ALLOC-012] a successful mal records dauStart/dauSize, sets dauWritten=0, resets dauWriteMask (length size, all zero), and sets A := daughter start',
  );

  // --- determinism (C-DET) ---
  it.todo(
    '[ALLOC-013] identical reserve/free/mal sequences yield identical intervals() and findFree results; the first-fit path draws no rng value',
  );
});
