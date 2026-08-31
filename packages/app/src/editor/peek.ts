// "Peek under the hood": a PURE projection of the gene editor's compiled view-model into
// per-source-line rows of opcode bytes. Every fact is derived — the compiled bytes + source
// map come from the shared editor view-model, and each byte's friendly label is resolved
// THROUGH the active set's mnemonic table (C-UI-SOURCE): no opcode/label constant lives here.
import { classic32 } from '@tierra26/engine/isa.ts';
import { parse } from '@tierra26/genescript/gs.ts';
import { mnemonicAtOpcode, mnemonicToVerb } from '@tierra26/genescript/vocab.ts';
import { viewModel, type EditorState as GeneState } from '@tierra26/ui/editor.ts';

// One compiled byte: its offset, the opcode it holds, and the friendly verb (or mnemonic) it is.
export interface PeekByte {
  offset: number;
  opcode: number;
  label: string;
}

// One source line that emitted bytes: its 1-based line number + trimmed text, the byte range
// [start, end) it compiled to, and the opcodes in that range.
export interface PeekRow {
  stmt: number;
  line: number;
  text: string;
  start: number;
  end: number;
  bytes: PeekByte[];
}

export interface PeekModel {
  rows: PeekRow[];
  totalBytes: number;
  ok: boolean; // false when the source does not compile (no partial genome to peek at)
}

// The classic-32 state the editor compiles under (mirrors cm.ts geneState — kept CM-free so the
// helper is unit-testable without loading CodeMirror).
function state(source: string): GeneState {
  return { mode: 'text', source, ast: parse(source), activeSet: classic32, sessionId: '' };
}

/** The friendly label for an opcode in classic-32: its verb, else its mnemonic, else `#opcode`. */
function labelOf(opcode: number): string {
  const mn = mnemonicAtOpcode(classic32, opcode);
  if (mn === undefined) return `#${opcode}`;
  return mnemonicToVerb(mn) ?? mn;
}

/**
 * buildPeekModel(source) — line ↔ bytes rows over the compiler source map. Ranges are already
 * sorted, disjoint and gap-free; each range's `stmt` indexes the parsed statements, whose `loc`
 * gives the owning source line. Returns `{ ok: false }` (no rows) when the program has errors.
 */
export function buildPeekModel(source: string): PeekModel {
  const compiled = viewModel(state(source)).compiled;
  const map = compiled.sourceMap;
  if (map === null) return { rows: [], totalBytes: 0, ok: false };

  const statements = parse(source).statements;
  const lines = source.split('\n');
  const bytes = compiled.bytes;

  const rows: PeekRow[] = map.ranges.map((r) => {
    const stmt = statements[r.stmt];
    const line = stmt ? stmt.loc.line : 0;
    const text = line > 0 ? (lines[line - 1] ?? '').trim() : '';
    const rowBytes: PeekByte[] = [];
    for (let off = r.start; off < r.end; off++) {
      const opcode = bytes[off] ?? 0;
      rowBytes.push({ offset: off, opcode, label: labelOf(opcode) });
    }
    return { stmt: r.stmt, line, text, start: r.start, end: r.end, bytes: rowBytes };
  });

  return { rows, totalBytes: bytes.length, ok: true };
}
