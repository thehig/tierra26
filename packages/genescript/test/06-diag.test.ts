// Diagnostics & Validation (DIAG) — kid-friendly errors/warnings/hints + static checks.
// Spec: docs/spec/genescript/06-diagnostics-and-validation.md (§8 acceptance criteria).
// Ref: 00-overview.md §3 (validate step), §5 (C-GS-KID / C-GS-SUBSET); ISA-VM-SPEC §6 (repro
//      life-cycle → replication hints), §5 (templates → label/jump checks), §3.3 (verb names).
//
// Pending until the compiler exists; encoded as node:test todo tests (spec-as-checklist).
// When validate.ts lands, replace `it.todo(name)` with `it(name, () => { ... })`.
// Do NOT import genescript src/ modules yet — they don't exist and an import error would fail the file.
//
// FIXME (C-GS-KID tone): DIAG-011 must assert the plain message text carries NO un-hovered jargon
//   (template/opcode/register/stack). Any technical word must appear in `hoverTerms`. Read messages
//   "aloud to an 8-year-old" — the tone contract for the whole app lives in the DIAG spec §4.
// FIXME (C-GS-DET determinism): DIAG-010 must build/compare the diagnostics list with NO RNG and NO
//   wall-clock; suggestion ranking is integer edit-distance then opcode order (a total order), and
//   the list is sorted by (line, colStart, code). Same source + active subset ⇒ identical list.
// FIXME (hints TEACH, not scold): §5.2 replication hints are NEVER errors — assert severity is
//   warning/hint with `teaches: true`. A half-built creature is a normal learning step.
import { describe, it } from 'node:test';

describe('Diagnostics & Validation (DIAG)', () => {
  it.todo('[DIAG-001] An unknown verb (not in the dictionary) yields an error `unknown-verb` with a "did you mean" suggestion of the nearest known verb (e.g. copybyte -> copy-byte)');
  it.todo('[DIAG-002] A verb that exists but is not in the active subset yields a GATED error `verb-not-unlocked` (C-GS-SUBSET), distinct from unknown-verb, reassuring the verb is real but not yet unlocked (teaches:true)');
  it.todo('[DIAG-003] A control verb targeting an undefined label yields an error `jump-to-missing-label`, suggesting the nearest defined label when one is close');
  it.todo('[DIAG-004] Two label: statements with the same name yield an error `duplicate-label`, spanned on the second definition and referencing the first');
  it.todo('[DIAG-005] A creature with a copy loop but no divide yields a warning/hint `wont-reproduce` (never an error), teaches:true, telling the kid to add divide');
  it.todo('[DIAG-006] Using copy-byte with no make-space before it yields a warning `no-space-before-copy` (never an error) — there is nowhere to copy into');
  it.todo('[DIAG-007] A push/pop imbalance (more load-* than save-*, or a negative running sum) yields a warning `stack-imbalance` (heuristic, not an error), teaches:true');
  it.todo('[DIAG-008] Every diagnostic carries a source span (line/cols + nodeId) and a stable `code`, so editor and block form highlight the exact statement from the same data');
  it.todo('[DIAG-009] Unreachable code after an unconditional jump/return with no inbound label yields a warning `unreachable-code` (teaches:true)');
  it.todo('[DIAG-010] Determinism (C-GS-DET): validating the same source with the same active subset twice yields an identical diagnostics list (same items, same order); no RNG/wall-clock');
  it.todo('[DIAG-011] Tone check (C-GS-KID): every message is short and jargon-free — any technical word is declared in hoverTerms (tooltip-resolvable); the plain sentence carries no un-hovered jargon');
  it.todo('[DIAG-012] A copy body with no jump-back loop yields a hint `no-copy-loop` ("copies a single byte and stops"), teaches:true');
  it.todo('[DIAG-013] No find/find-back/find-forward yields a hint `no-self-location` ("cannot tell where it starts or how big it is"), teaches:true');
  it.todo('[DIAG-014] Errors block compilation; warnings and hints do not — hasErrors is true iff an error is present, and a warning/hint-only program still lowers to valid bytes');
});
