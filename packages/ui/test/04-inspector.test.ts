// Inspector (INSPECTOR) — acceptance criteria as pending tests.
// Ref: docs/spec/ui/04-inspector.md §8. Keep 1:1 with the doc.
// No src/ imports yet; replace it.todo(name) with it(name, () => {...}) as built.
import { describe, it } from 'node:test';

describe('Inspector (INSPECTOR)', () => {
  it.todo('[INSPECTOR-001] toPanelModel is a pure function of InspectView (+ disassembler) — no clock/RNG/engine');
  it.todo('[INSPECTOR-002] registers A–D in the panel equal the engine state in the view');
  it.todo('[INSPECTOR-003] flags E/S/Z render their boolean state from the view');
  it.todo('[INSPECTOR-004] stack rows reflect stack/sp with the top slot marked; sp==0 → empty');
  it.todo('[INSPECTOR-005] the disassembly marks exactly the row whose byte range contains the IP');
  it.todo('[INSPECTOR-006] daughter fillPct = floor(written*100/size) (integer); null daughter → no panel');
  it.todo('[INSPECTOR-007] genotype label + population resolve from the genebank via the view (C-UI-SOURCE)');
  it.todo('[INSPECTOR-008] "open in editor" yields a genome byte-identical to what the Inspector disassembles (UIINV-EDITOR-ENGINE)');
  it.todo('[INSPECTOR-009] detail is fetched via the worker requestInspect; no direct engine call, no mutation (C-UI-VIEW)');
  it.todo('[INSPECTOR-010] the marked IP line equals the peek-under-hood line the Editor marks for the same genome+ip');
  it.todo('[INSPECTOR-011] a garbage/mutated genome still renders a full disassembly (DISASM never throws)');
  it.todo('[INSPECTOR-012] occupied:false (free/dead address) renders an empty state, no panels');
  it.todo('[INSPECTOR-013] concurrent inspect requests are matched by correlationId, never crossed');
  it.todo('[INSPECTOR-014] (visual) panel layout, register/flag chips, stack and disassembly styling');
});
