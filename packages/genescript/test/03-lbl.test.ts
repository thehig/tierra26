// Labels & Templates (LBL) — pending acceptance criteria.
// Ref: docs/spec/genescript/03-labels-and-templates.md §8.
// Ref: engine ISA-VM-SPEC.md §5 (template addressing) & §5.5 (adjacent-template MERGE gotcha).
// Pending until the LBL lowering pass exists; encoded as node:test todo tests.
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
// NO src/ imports yet — the compiler does not exist; an import error would fail this file.
//
// FIXME(merge-avoidance): the VM measures a template by scanning consecutive nop bytes until a
//   non-nop (ISA-VM §5.1), so two back-to-back nop-runs read as ONE longer template and silently
//   break addressing (§5.5). LBL must guarantee generated code never emits adjacent nop-runs
//   without a non-nop spacer between them (LBL-005). Raw VM merge behavior is preserved — do NOT
//   fix it in the VM. Assert both: (a) no two nop-runs abut in emitted bytes; (b) a real verb
//   after a label already counts as the spacer (no redundant spacer inserted).
//
// FIXME(uniqueness-vs-length): distinct labels must get patterns that are neither equal nor
//   complementary (else a reference for X could also match label Y — LBL-002). Length k yields
//   only 2^(k-1) usable representatives, so length must GROW when a shorter one can't stay
//   unambiguous (LBL-006) — but shorter is cheaper to emit and mutate. Tests must pin the
//   tradeoff: minimal length while unambiguous, grow exactly when the current length is exhausted.
import { describe, it } from 'node:test';

describe('Labels & Templates (LBL)', () => {
  it.todo('[LBL-001] a label + jump-back lowers to a template T at the label and its complement (T-bar) at the jump (T[i]+Tbar[i]==NopS==1)');
  it.todo('[LBL-002] two distinct labels get distinguishable patterns: neither equal nor complementary (Tx!=Ty and Tx!=complement(Ty))');
  it.todo('[LBL-003] under the complementary search a reference resolves to the intended label (nearest in-direction) and no other, within the search limit');
  it.todo('[LBL-004] direction is chosen from the verb: jump-back/find-back->backward, find-forward->forward, jump/call/find->outward');
  it.todo('[LBL-005] adjacent nop-runs (label->ref, ref->label, ref->ref) are separated by a non-nop spacer so the VM never reads them as one merged template');
  it.todo('[LBL-006] template length grows only when needed for uniqueness: minimal while unambiguous, increments when the current length is exhausted (length k supports 2^(k-1) labels)');
  it.todo('[LBL-007] allocation is deterministic: same source compiles to byte-identical templates+spacers; renaming a label (order unchanged) leaves the bytes unchanged (no RNG, no name-hash)');
  it.todo('[LBL-008] find-back and find-forward pick the correct direction: find-back start finds the start landmark behind, find-forward end finds the end ahead; they never cross-match');
  it.todo('[LBL-009] start/end self-location markers get distinct templates at the true first/last instruction so size = end - start spans the whole genome (precondition of GSINV-ANCESTOR)');
  it.todo('[LBL-010] every emitted nop run is well-formed: length >= MinTemplSize(1), only the active set nop0/nop1 opcodes, read from the active set (never hard-coded)');
  it.todo('[LBL-011] only referenced labels get templates; an unreferenced label emits no nop run');
  it.todo('[LBL-012] uniqueness is guaranteed within the compiled creature only; LBL does not depend on the absence of a complementary match elsewhere in the soup (parasitism is intended)');
});
