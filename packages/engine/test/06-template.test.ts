// Template Addressing (TMPL) — complementary nop-template search.
// Spec: docs/spec/engine/systems/06-template-addressing.md (§8 acceptance criteria).
// Ref: ISA-VM-SPEC §5 / §5.5; M0-TECH-DESIGN §7 (template.ts); original-tierra 02 §5 (ctemplate).
//
// Pending until the engine exists; encoded as node:test todo tests (spec-as-checklist).
// When template.ts lands, replace `it.todo(name)` with `it(name, () => { ... })`.
// Do NOT import engine src/ modules yet — they don't exist and an import error would fail the file.
//
// FIXME (§5.5 adjacent-template-merge): two back-to-back nop runs are read by the VM as ONE longer
//   template. TMPL-010 must assert the raw VM merge behavior is PRESERVED (not "fixed") — the
//   GeneScript language layer prevents accidental collisions, the VM does not change.
// FIXME (avgSize integer determinism): Search_limit = floor(SearchLimit(5.0) * avgSize) with avgSize
//   an INTEGER running mean maintained by World. Tests must build/assert the limit from the integer
//   avgSize (never a float), or the same soup could resolve differently across engines (breaks
//   C-DET / INV-DET). No floating point in any assertion on the search path.
import { describe, it } from 'node:test';

describe('Template Addressing (TMPL)', () => {
  it.todo('[TMPL-001] Given a source template, forward search finds the NEAREST complementary template ahead and returns its (landing) address');
  it.todo('[TMPL-002] Given a source template, backward search finds the nearest complementary template behind the source');
  it.todo('[TMPL-003] Outward search tests both directions per step and returns the nearer hit; a same-step tie resolves to forward');
  it.todo('[TMPL-004] The landing address is JUST PAST the matched template: ad(matchPos + size), never the first byte of the nop run');
  it.todo('[TMPL-005] Matching is complementary (nop0<->nop1, soup[src+i]+soup[pos+i]==NopS==1); an IDENTICAL template does NOT match');
  it.todo('[TMPL-006] A miss beyond Search_limit=floor(SearchLimit(5.0)*avgSize) sets E, advances IP past the own template (iip=s+1), and leaves dest registers unchanged');
  it.todo('[TMPL-007] Search wraps around the soup ends via ad(): a complementary template is matched across the boundary (incl. a target straddling the wrap)');
  it.todo('[TMPL-008] adr* writes A:=addr, C:=size (+distance to 3rd reg if bound); jmp* loads addr into IP (ipWasSet); call additionally pushes the return address');
  it.todo('[TMPL-009] Template size respects MinTemplSize=1 (a single nop is legal) and s==0 is treated as "no template" (source address returned, no E)');
  it.todo('[TMPL-010] Adjacent-template MERGE behavior documented: two back-to-back nop runs are read as ONE longer template (raw VM semantics preserved)');
});
