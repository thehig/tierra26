// Vocabulary & Keywords (VOCAB) — pending acceptance tests.
// Ref: docs/spec/genescript/02-vocabulary-and-keywords.md §8 (VOCAB-NNN).
// The definitive verb <-> classic-32-mnemonic table, register-specific verbs, and the
// color-coded keyword taxonomy + tooltips (kid line + machine-truth "more" line).
// Verbs map to opcodes via the engine ISA at compile time (C-GS-NOOPCODES) — the vocabulary
// records a mnemonic STRING, never an opcode number. Tooltips are plain language (C-GS-KID).
//
// Pending until the vocabulary/compiler exist; encoded as node:test todo tests (spec-as-checklist).
// NO src imports yet (the modules don't exist — an import error would fail the file).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Vocabulary & Keywords (VOCAB)', () => {
  it.todo('[VOCAB-001] VOCABULARY has exactly 32 entries, one per classic-32 instruction (total coverage)');
  it.todo('[VOCAB-002] every classic-32 mnemonic (all 32 from ISA-VM §3.3) is covered by exactly one verb (bijection)');
  it.todo('[VOCAB-003] all 32 verb strings are unique (no two keywords collide)');
  it.todo('[VOCAB-004] every entry.mnemonic is a real classic-32 dictionary mnemonic (verb maps to an actual engine instruction)');
  it.todo('[VOCAB-005] a verb ending in -a/-b/-c/-d has register set to that letter, matching the engine binding destination register');
  it.todo('[VOCAB-006] register-specific families are exactly grow-a/grow-b/grow-c + shrink-c, save-a..save-d, load-a..load-d, copy-a-to-b, copy-c-to-d, subtract (C=A-B), subtract-into-a (A=A-C); no member for an unbound register (no grow-d/shrink-a)');
  it.todo('[VOCAB-007] nop0/nop1 are the only two marker-category entries and their verbs are mark-0/mark-1');
  it.todo('[VOCAB-008] every entry has a non-empty tooltip.kid in plain language: no mnemonic string, no register-letter jargon, no word "opcode" (C-GS-KID)');
  it.todo('[VOCAB-009] every entry has a non-empty tooltip.machine ("machine truth") consistent with ISA-VM §4 semantics for its mnemonic');
  it.todo('[VOCAB-010] every category is one of action/register/marker/control/value, and all flow ops (jmpo/jmpb/call/ret/ifz/adro/adrb/adrf/mal/divide) are control');
  it.todo('[VOCAB-011] no entry hard-codes an opcode number: a VerbEntry exposes only a mnemonic string, opcode resolution deferred to the engine active set (C-GS-NOOPCODES)');
  it.todo('[VOCAB-012] every register-role usage references only registers A-D (classic core), never E/F');
  it.todo('[VOCAB-013] table presentation order matches the engine §3.3 load order (0-31); order is presentational only, nothing keys off the index (C-GS-NOOPCODES)');
});
