// Instruction Set & Dispatch (ISA) — pending acceptance tests.
// Ref: docs/spec/engine/systems/04-instruction-set-and-dispatch.md §8 (ISA-NNN).
// Two-level model: canonical dictionary of DictEntry {id,mnemonic,gene,kind,exec,role}
// vs a named InstructionSet mapping opcode->InstrId (+ bindings, n, bitWidth, nop0/nop1).
// Dispatch is on InstrId, not the raw opcode byte. Decoding is [05]; templates are [06].
//
// Pending until the engine exists; encoded as node:test todo tests (spec-as-checklist).
// NO src imports yet (the modules don't exist — an import error would fail the file).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Instruction Set & Dispatch (ISA)', () => {
  it.todo('[ISA-001] classic32 has exactly 32 entries (n === 32 and opcodeToId.length === 32)');
  it.todo('[ISA-002] in classic32, nop0 is opcode 0 and nop1 is opcode 1 (INV-TEMPLATE)');
  it.todo('[ISA-003] every classic32 opcode maps to a dictionary InstrId that has a non-null exec handler');
  it.todo('[ISA-004] classic32.bitWidth === 5 (ceil(log2 32))');
  it.todo('[ISA-005] every mutation-produced byte decodes to a valid opcode: (b & ((1<<bitWidth)-1)) % n is always in [0,n)');
  it.todo('[ISA-006] a tutorial subset is a strict subset of the dictionary (size < 32, every InstrId exists, nop0/nop1 still at 0/1)');
  it.todo('[ISA-007] dispatch is keyed on InstrId: an op in both classic32 and a subset (at different opcodes) resolves to the same InstrId and same exec handler');
  it.todo('[ISA-008] register binding lives on the set: each classic32 opcode binding references only registers A-D (indices 0..3); reg->reg ops carry 2, nops carry none');
  it.todo('[ISA-009] the dictionary has no duplicate mnemonic and no duplicate gene, and each InstrId equals its index in DICTIONARY');
  it.todo("[ISA-010] a SubsetSpec assigns opcodes by the canonical rule (nop0=0,nop1=1, then classic-32 load order) — identical bytes everywhere (S10)");
  it.todo("[ISA-011] mutation-domain fold (low bitWidth bits mod N) yields a valid opcode for every N incl. non-power-of-two (S13)");
});
