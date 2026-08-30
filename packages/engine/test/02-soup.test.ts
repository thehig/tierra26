// Soup & Memory Model (SOUP) — address space + protection.
// Companion to docs/spec/engine/systems/02-soup-and-memory.md §8 (acceptance criteria).
// Allocation internals are a SEPARATE system — see 03-alloc.test.ts / [03] — not tested here.
//
// Pending until the engine exists; encoded as node:test todo tests (spec-as-checklist).
// Node reports these as `# todo`, so the suite is green-runnable pre-implementation.
// Do NOT import engine src/ modules yet (they don't exist — an import error would fail the file).
// When soup.ts lands, replace each `it.todo(name)` with `it(name, () => { ... })`. Keep 1:1 with §8.
import { describe, it } from 'node:test';

describe('Soup & Memory (SOUP)', () => {
  // --- Circular addressing / wrap-around (C-ADDR) ---
  it.todo('[SOUP-001] ad(x) maps in-range indices to themselves and reduces x>=S modulo S (ad(S)==0, ad(S+3)==3, ad(2S+7)==7)');
  it.todo('[SOUP-002] ad(x) maps negative indices into [0,S) (ad(-1)==S-1, ad(-S)==0, ad(-S-2)==S-2)');
  it.todo('[SOUP-003] read wraps at both ends: read(S) returns byte at index 0 and read(-1) returns byte at index S-1');
  it.todo('[SOUP-004] write wraps at both ends: writing at index S stores into index 0 and writing at index -1 stores into index S-1');

  // --- Interface & substrate ---
  it.todo('[SOUP-005] a fresh Soup(size) has bytes.length===size, defaults size to 60000, and every byte is initially 0');
  it.todo('[SOUP-006] write masks stored values to one byte (v & 0xff) so a cell never overflows its neighbour; read returns the [0,255] opcode');
  it.todo('[SOUP-007] soup bytes are the mutation substrate: an external bit-flip of a byte is observed by a subsequent read of that address');

  // --- Protection: reads/execute are global (the parasite premise) (C-PROT) ---
  it.todo('[SOUP-008] read/execute of an address inside ANOTHER creature cell is allowed and returns that foreign byte (never protection-checked)');
  it.todo('[SOUP-009] read of an address in free (unowned) soup is allowed (reads are global)');

  // --- Protection: writes are local (C-PROT) ---
  it.todo('[SOUP-010] canWrite is true for an address inside the creature OWN cell [start,start+size); a handler write there succeeds');
  it.todo('[SOUP-011] canWrite is true for an address inside the creature currently-allocated DAUGHTER cell [dauStart,dauStart+dauSize) (the mal->divide window)');
  it.todo('[SOUP-012] canWrite is false inside ANOTHER creature cell: handler performs NO write and calls raiseE (sets E flag) — C-ERR/C-PROT');
  it.todo('[SOUP-013] canWrite is false for an address in free/unowned soup (outside both own and daughter windows); write denied and E set');
  it.todo('[SOUP-014] with no daughter (dauSize==0) the daughter window is closed: writing where a daughter used to be is denied and sets E');
  it.todo('[SOUP-015] canWrite normalizes via ad first, so a cell that WRAPS the soup end (start+size>S) admits its wrapped tail and rejects outside addresses');
  it.todo('[SOUP-016] a write violation raises E and moves the creature UP the reaper queue via raiseE; it never throws a JS exception on the hot path (C-ERR)');

  // --- The parasite niche (integration premise) ---
  it.todo('[SOUP-017] a creature may READ/EXECUTE a foreign copy routine while WRITING only into its own daughter: same foreign address is readable but not writable (the asymmetry enabling parasitism)');
});
