# Inspector — Engineering Spec (Code: INSPECTOR · Milestone: M2)

**Status:** v1. Obeys [`00-overview.md`](00-overview.md) contracts (§2: C-UI-VIEW, C-UI-SOURCE;
§4: UIINV-EDITOR-ENGINE). Doc/test conventions per
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8.
Consumes: [`01-worker-protocol.md`](01-worker-protocol.md) (`requestInspect`/`inspectResult`),
engine [`07-cpu…`](../engine/systems/07-cpu-and-execution-cycle.md) /
[`08-…reproduction`](../engine/systems/08-creature-lifecycle-and-reproduction.md) /
[`12-genebank`](../engine/systems/12-genotype-and-genebank.md), and GeneScript
[`05-disassembler`](../genescript/05-disassembler.md).

---

## 1. Purpose & responsibility

The Inspector is the **read-only detail view of one creature** (or soup address): its CPU
registers, stack, flags, live disassembly with the instruction pointer marked, its daughter's
fill progress, and its genotype/lineage. It requests detail through the worker (never touches
the engine directly) and renders the returned `InspectView` as a pure panel model. Its job is
to make a running program *legible* — and to hand that creature's genome to the Editor for
study ("open in editor" — the evolved-parasite flow).

## 2. Interfaces

```ts
import type { InspectView, TankCommand } from '@tierra26/ui'; // (future)

// Request comes from a click in the Tank [02] or a selection; goes to the worker [01].
interface InspectRequest { sessionId: string; address: number; correlationId: string; }

// The worker replies with a read-only view (subset of the engine snapshot for one creature).
interface InspectView {
  address: number; occupied: boolean;
  creatureId: number; parentId: number; bornAtCycle: number;
  genotypeId: number; genotypeLabel: string; population: number;
  ip: number; registers: { A: number; B: number; C: number; D: number };
  flags: { E: boolean; S: boolean; Z: boolean };
  stack: number[]; sp: number;
  cell: { start: number; size: number };
  daughter: { start: number; size: number; written: number } | null;
  genome: Uint8Array;            // the creature's bytes, for disassembly
}

// The pure view-model the panels render:
function toPanelModel(v: InspectView, disasm: Disassembler): InspectorPanels;
interface InspectorPanels {
  header: { id: number; genotype: string; population: number; parent: number; age: number };
  registers: { name: string; value: number }[];
  flags: { name: string; on: boolean }[];
  stackRows: { index: number; value: number; isTop: boolean }[];
  disassembly: { line: number; text: string; bytes: [number, number]; isIp: boolean }[];
  daughter: { present: boolean; fillPct: number } | null;   // integer percent
  openInEditorGenome: Uint8Array;   // === v.genome
}
```

## 3. Data structures
- **`InspectView`** — the worker's read-only reply for one creature (a projection of the engine
  snapshot + genebank; never a writable engine handle — C-UI-VIEW / WORKER-009).
- **`InspectorPanels`** — the pure render model derived solely from `InspectView` + the
  GeneScript disassembler; carries no engine reference.
- **Disassembly rows** carry `bytes: [start,end)` so the row aligns with peek-under-hood
  highlighting and the IP marker.

## 4. Behavior / algorithms
- **Request** — a click in the Tank hit-tests to an address (TANK-009) → `requestInspect(addr)`
  through the worker [01]; the reply's `correlationId` matches (WORKER-008). The Inspector issues
  no engine calls of its own.
- **`toPanelModel` (pure)** — maps registers A–D, flags E/S/Z, and the stack (marking the top
  slot at `sp`) straight from the view; computes `daughter.fillPct = daughter ? floor(written*100/size) : —` (integer).
- **Live disassembly** — runs the creature's `genome` through the GeneScript disassembler [05]
  to GeneScript lines with per-line byte ranges; the row whose byte range contains
  `ip - cell.start` is flagged `isIp`. This is the same disassembly the Editor's peek-under-hood
  uses, so the IP line the Inspector marks and the Editor line agree (UIINV-EDITOR-ENGINE).
- **Updates** — while a session runs, the Inspector re-requests (or consumes per-frame inspect
  data) on each paint/step; it holds no authoritative state and shows the latest reply
  (UIINV-ROUNDTRIP). Between steps the panel is stable.
- **Open in editor** — hands `v.genome` (verbatim) to the Editor [03] `disassemble-into-editor`;
  the genome the Inspector shows is byte-identical to what the Editor loads (UIINV-EDITOR-ENGINE).
- **Free address** — if `occupied:false`, render an empty/"dead code" state, no panels.

## 5. Interconnections
- **[01] Worker** — the only channel for detail (`requestInspect`/`inspectResult`).
- **[02] Tank** — click-to-inspect originates here; hover/selection sync by address.
- **[03] Editor** — "open in editor" target; shared disassembler ⇒ consistent lines.
- **[05] GeneScript Disassembler** — turns bytes → GeneScript for the disassembly panel.
- **engine [12] Genebank** — genotype label/population come through the view.

## 6. Determinism & edge cases
- `toPanelModel` is pure and deterministic: same `InspectView` → same panels (no clock/RNG).
- A creature that dies between request and reply → the worker returns `occupied:false` (or a
  tombstone); the Inspector shows "gone", never stale-but-live data.
- `sp==0` → empty stack rows; full stack (10) renders all slots.
- Mutated/garbage genome still disassembles (DISASM never throws) — the panel always renders.
- Concurrent inspects never cross-match (correlationId, WORKER-008).

## 7. Fidelity notes
- **[CORE]** the Inspector is read-only and worker-mediated (C-UI-VIEW) — it must never mutate.
- **[CORE]** one-genome-three-views consistency (UIINV-EDITOR-ENGINE).
- **[MOD]** modern panel UX; original Tierra had a debugger/CPU-spy — this is its friendly heir.
- **[OPTIONAL]** stepping *into* a specific creature's CPU (single-creature debug) beyond
  whole-soup step — later.

## 8. Acceptance criteria
- **INSPECTOR-001** `toPanelModel` is a pure function of `InspectView` (+ disassembler) — same
  input, same panels; no clock/RNG/engine access.
- **INSPECTOR-002** Registers A–D in the panel equal the engine state in the view.
- **INSPECTOR-003** Flags E/S/Z render their boolean state from the view.
- **INSPECTOR-004** Stack rows reflect `stack`/`sp`, with the top slot marked; `sp==0` → empty.
- **INSPECTOR-005** The disassembly marks exactly the row whose byte range contains the IP
  (`ip - cell.start`).
- **INSPECTOR-006** Daughter `fillPct = floor(written*100/size)` (integer); `null` daughter → no
  daughter panel.
- **INSPECTOR-007** Genotype label + population resolve from the genebank via the view
  (C-UI-SOURCE), not recomputed in the UI.
- **INSPECTOR-008** "Open in editor" yields a genome byte-identical to the one the Inspector
  disassembles (UIINV-EDITOR-ENGINE).
- **INSPECTOR-009** Detail is fetched via the worker `requestInspect`; the Inspector issues no
  direct engine call and mutates nothing (C-UI-VIEW).
- **INSPECTOR-010** The IP line the Inspector marks equals the peek-under-hood line the Editor
  would mark for the same genome+ip (shared disassembler consistency).
- **INSPECTOR-011** A garbage/mutated genome still renders a full disassembly (DISASM never
  throws).
- **INSPECTOR-012** `occupied:false` (free/dead address) renders an empty state, no panels.
- **INSPECTOR-013** Concurrent inspect requests are matched by `correlationId`, never crossed.
- **INSPECTOR-014** `(visual)` panel layout, register/flag chips, stack and disassembly styling
  per the design pass.

## 9. Open questions
1. Poll-on-step vs stream per-frame inspect data for the selected creature — perf vs latency
   (propose: piggy-back the selected creature's detail on frames when one is selected).
2. Following a lineage across `divide` (auto-select the daughter?) — later.
3. How much history (register timeline) to show — defer to charts/design.
