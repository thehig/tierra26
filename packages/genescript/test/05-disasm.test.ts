// Disassembler (DISASM) — genome bytes + active set -> GeneScript (best-effort).
// Spec: docs/spec/genescript/05-disassembler.md (§8 acceptance criteria).
// Ref: docs/spec/genescript/00-overview.md §3 (reverse pipeline), §5 (C-GS-ROUNDTRIP,
//   C-GS-NOOPCODES), §6 (GSINV-ROUNDTRIP, GSINV-SOURCEMAP);
//   docs/spec/engine/ISA-VM-SPEC.md §3.3 (opcode->mnemonic->verb via active set),
//   §5 (templates -> labels), §8 (encoding summary: disassembly = index -> mnemonic).
//
// Powers "peek under the hood" and studying EVOLVED creatures: the disassembler must be TOTAL
// and NEVER THROW on arbitrary/mutated bytes — the raw fallback guarantees every genome
// round-trips to something editable.
//
// Pending until the disassembler exists; encoded as node:test todo tests (spec-as-checklist).
// When disasm.ts lands, replace `it.todo(name)` with `it(name, () => { ... })`.
// Do NOT import genescript src/ modules yet — they don't exist and an import error would fail the file.
//
// FIXME (raw = literal, never mod N): a mutated byte >= set.size renders as `raw byte N` with the
//   LITERAL value preserved (not folded mod N as the engine's exec path would). Round-trip depends
//   on this — folding here would break the fixed point for evolved genomes. See DISASM-007/017.
// FIXME (§5.5 template merge): adjacent nop-runs the VM would MERGE must NOT be guessed into a label
//   — they fall back to raw. Reconstruction refuses to "fix" evolved/parasite code. See DISASM-008.
// FIXME (round-trip is up to renaming): GSINV-ROUNDTRIP preserves the VERB SEQUENCE and re-emits
//   byte-identical output; label NAMES may differ (label1..). Assert bytes, not names. See DISASM-010.
import { describe, it } from 'node:test';

describe('Disassembler (DISASM)', () => {
  it.todo('[DISASM-001] Every active-set opcode disassembles to its GeneScript verb (opcode->verb via the active set, reverse of [04])');
  it.todo('[DISASM-002] Opcode->verb reads the ACTIVE SET (C-GS-NOOPCODES): the same byte under a different set yields that set\'s verb; no hard-coded opcode numbers');
  it.todo('[DISASM-003] A complementary template PAIR (bare landmark + addressing instruction\'s complement) becomes an inferred label: a `labelK:` line plus a `find/jump/call <labelK>` reference');
  it.todo('[DISASM-004] Label names are generated deterministically as label1, label2, … in DEFINING-BYTE-INDEX order, independent of discovery order');
  it.todo('[DISASM-005] Addressing verbs are rewritten from mnemonics: adrb->find-back, adrf->find-forward, adro->find, jmpb->jump-back, jmpo->jump, call->call, each with the inferred <label> operand');
  it.todo('[DISASM-006] A DEFINITION run with no referencing addressing instruction still emits a bare `labelK:` line at its landmark (so the template survives recompilation)');
  it.todo('[DISASM-007] A mutated opcode (byte >= set.size) falls back to `raw byte N`, preserving the LITERAL value (not folded mod N), and never throws');
  it.todo('[DISASM-008] An addressing instruction whose template cannot be UNAMBIGUOUSLY paired (no complement / ambiguous / oversized / merged per ISA-VM §5.5) falls back to `raw <mnemonic>` rather than fabricating a label — never throws');
  it.todo('[DISASM-009] A dangling addressing instruction at end-of-genome with no following template renders as `raw <mnemonic>`; a trailing/unpaired lone nop renders as `raw mark-0/mark-1`');
  it.todo('[DISASM-010] GSINV-ROUNDTRIP: for a corpus (incl. the ancestor), compile -> disassemble -> compile is BYTE-IDENTICAL (verb sequence preserved; labels may be renamed) — a fixed point');
  it.todo('[DISASM-011] Disassembly of an arbitrary RANDOM genome always succeeds (never throws) for any length/byte values, and its output recompiles to the original bytes (raw fallback = fixed point even for garbage)');
  it.todo('[DISASM-012] The annotation stream aligns 1:1 with bytes: annotations.length === genome.length and annotations[i].byteIndex === i for every byte (reverse of GSINV-SOURCEMAP)');
  it.todo('[DISASM-013] Each annotation carries the correct role (verb/template/raw-op/raw-byte), resolved mnemonic/verb (or null when raw/out-of-range), and a lineIndex consistent both ways (bytes->line and line->bytes)');
  it.todo('[DISASM-014] Template bytes of a paired addressing instruction carry the SAME labelRef as the label\'s defining run, so the under-the-hood view can highlight both ends of a jump');
  it.todo('[DISASM-015] Determinism (C-GS-DET): disassembling the same genome + active set twice yields identical text, lines, labels, and annotations (no RNG, no map-order)');
  it.todo('[DISASM-016] Edge inputs never throw and round-trip: empty genome -> empty text + empty annotation stream; all-nop -> labels/raw as specified; all-out-of-range -> all `raw byte N`; each recompiles to its input');
  it.todo('[DISASM-017] No `mod N` folding and no realignment: bytes are decoded positionally and preserved literally, so a runtime mid-instruction jump target is rendered faithfully (no invented instruction boundaries)');
});
