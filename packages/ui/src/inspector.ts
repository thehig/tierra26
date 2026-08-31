// ============================================================================
// INSPECTOR [ui/04] — the inspector panel VIEW-MODEL (pure; NO DOM, NO clock/RNG).
//
// The read-only detail view of ONE creature/soup address. It renders the
// worker-owned `InspectView` (S4 single source, imported from protocol.ts — never
// redefined) as a pure `InspectorPanels` model: CPU registers, flags, stack,
// live disassembly with the instruction pointer marked, daughter fill, and the
// genotype/lineage header. Detail is fetched THROUGH the worker (requestInspect /
// inspectResult, matched by correlationId); the Inspector issues no engine call
// and owns no sim state (C-UI-VIEW). The genome it disassembles is byte-identical
// to the one "open in editor" hands the Editor (UIINV-EDITOR-ENGINE).
//
// Spec: docs/spec/ui/04-inspector.md (§2 interfaces, §4 rules, §8 INSPECTOR-0NN).
// strip-types safe: explicit fields, `import type`, no enums/param-properties.
// ============================================================================
import type { InspectView, HostCommand } from './protocol.ts';

// ---- Request path (Tank click / selection -> worker requestInspect) ---------
// A detail request: which session, which soup address, correlated to its reply.
export interface InspectRequest {
  sessionId: string;
  address: number;
  correlationId: string;
}

// Build a well-formed inspect request (pure helper).
export function buildInspectRequest(
  sessionId: string,
  address: number,
  correlationId: string,
): InspectRequest {
  return { sessionId, address, correlationId };
}

// Map an InspectRequest to the wire `requestInspect` HostCommand for the worker
// [01] to post. The Inspector never talks to the engine directly (C-UI-VIEW).
export function inspectRequestToHost(req: InspectRequest): HostCommand {
  return {
    type: 'requestInspect',
    addr: req.address,
    sessionId: req.sessionId,
    correlationId: req.correlationId,
  };
}

// Match an inspectResult reply back to its pending request by correlationId —
// concurrent inspects never cross (WORKER-008 / INSPECTOR-013).
export function matchInspectResult(
  pending: readonly InspectRequest[],
  reply: { correlationId?: string },
): InspectRequest | undefined {
  if (reply.correlationId === undefined) return undefined;
  return pending.find((r) => r.correlationId === reply.correlationId);
}

// ---- Disassembler seam (shared with the Editor's peek-under-hood) -----------
// One disassembled row: GeneScript text + the contiguous genome byte range it
// covers ([start,end), end exclusive). Rows tile [0, genome.length) 1:1.
export interface DisasmRow {
  line: number;              // 1-based row number in emit (byte) order
  text: string;
  bytes: [number, number];   // [start, end) into the genome
}

// A Disassembler turns genome bytes -> rows. Pure; NEVER throws (DISASM total).
export type Disassembler = (genome: Uint8Array) => DisasmRow[];

// Adapter over genescript `disassemble(bytes, active)`: reshapes its `lines` into
// numbered rows. Bind an active InstructionSet to get a concrete Disassembler.
// (Typed structurally to avoid a hard build dep on the genescript/engine paths.)
type GsDisassemble = (
  bytes: Uint8Array,
  active: unknown,
) => { lines: { text: string; bytes: [number, number] }[] };

export function makeDisassembler(
  disassemble: GsDisassemble,
  active: unknown,
): Disassembler {
  return (genome: Uint8Array): DisasmRow[] =>
    disassemble(genome, active).lines.map((l, i) => ({
      line: i + 1,
      text: l.text,
      bytes: [l.bytes[0], l.bytes[1]],
    }));
}

// ---- The pure panel model the DOM layer renders -----------------------------
export interface InspectorPanels {
  header: { id: number; genotype: string; population: number; parent: number; age: number };
  registers: { name: string; value: number }[];
  flags: { name: string; on: boolean }[];
  stackRows: { index: number; value: number; isTop: boolean }[];
  disassembly: { line: number; text: string; bytes: [number, number]; isIp: boolean }[];
  daughter: { present: boolean; fillPct: number } | null; // integer percent
  openInEditorGenome: Uint8Array;                          // === v.genome (byte-identical)
}

// Which disassembly row contains the IP. The IP is an absolute soup address; a
// row's byte range is genome-relative, so the offset is `ip - cell.start`.
// Half-open range: start <= offset < end. Returns -1 if no row covers it.
function ipRowIndex(rows: readonly DisasmRow[], ip: number, cellStart: number): number {
  const off = ip - cellStart;
  for (let i = 0; i < rows.length; i++) {
    const [s, e] = rows[i]!.bytes;
    if (off >= s && off < e) return i;
  }
  return -1;
}

// PURE projection of the worker-owned InspectView into the render model.
//   - `disasm`: the shared GeneScript disassembler (same as the Editor uses).
//   - `currentCycle`: the live cycle used to derive age = currentCycle - bornAtCycle
//     (clamped >= 0). InspectView carries no clock, so age needs this param; when
//     omitted, age is 0 (no elapsed information available).
// Returns `null` for a free/dead address (occupied:false) — the empty state,
// no panels (INSPECTOR-012).
export function toPanelModel(
  v: InspectView,
  disasm: Disassembler,
  currentCycle?: number,
): InspectorPanels | null {
  if (!v.occupied) return null;

  const rows = disasm(v.genome);
  const ipIdx = ipRowIndex(rows, v.ip, v.cell.start);

  const age = currentCycle === undefined ? 0 : Math.max(0, currentCycle - v.bornAtCycle);

  const registers = [
    { name: 'A', value: v.registers.A },
    { name: 'B', value: v.registers.B },
    { name: 'C', value: v.registers.C },
    { name: 'D', value: v.registers.D },
  ];

  const flags = [
    { name: 'E', on: v.flags.E },
    { name: 'S', on: v.flags.S },
    { name: 'Z', on: v.flags.Z },
  ];

  // Occupied slots are 0..sp-1 (sp = depth / next-free pointer); top = sp-1.
  // sp==0 -> no rows (empty). See engine cpu.ts push/pop semantics.
  const stackRows: { index: number; value: number; isTop: boolean }[] = [];
  for (let i = 0; i < v.sp; i++) {
    stackRows.push({ index: i, value: v.stack[i] ?? 0, isTop: i === v.sp - 1 });
  }

  const disassembly = rows.map((r, i) => ({
    line: r.line,
    text: r.text,
    bytes: r.bytes,
    isIp: i === ipIdx,
  }));

  const daughter =
    v.daughter === null
      ? null
      : {
          present: true,
          fillPct:
            v.daughter.size > 0
              ? Math.floor((v.daughter.written * 100) / v.daughter.size)
              : 0,
        };

  return {
    header: {
      id: v.creatureId,
      genotype: v.genotypeLabel,
      population: v.population,
      parent: v.parentId,
      age,
    },
    registers,
    flags,
    stackRows,
    disassembly,
    daughter,
    openInEditorGenome: v.genome, // verbatim handoff to the Editor (UIINV-EDITOR-ENGINE)
  };
}
