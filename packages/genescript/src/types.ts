// GeneScript shared types — the single source of truth for the AST, diagnostics, and the
// compile surface, so no downstream system re-defines them (validation S17/S19/S20).
// Canonical names: Program / Stmt (not Statement/CheckedProgram); SourceSpan (== Loc).

export type NodeId = string;

// ---- Lexer ----
export interface Token {
  kind: 'word' | 'colon' | 'comment' | 'newline' | 'eof' | 'error';
  text: string;   // raw lexeme (original case preserved)
  line: number;   // 1-based
  col: number;    // 1-based
}

// ---- Source spans / diagnostics (DIAG owns the semantics; defined once here) ----
export interface SourceSpan {
  line: number;        // 1-based
  colStart: number;    // 1-based inclusive
  colEnd: number;      // 1-based exclusive
  nodeId: NodeId;      // the AST node this span belongs to (block form has no cols)
}
export type Loc = SourceSpan;

export type Severity = 'error' | 'warning' | 'hint';
export type DiagCode =
  | 'unknown-verb' | 'verb-not-in-subset' | 'undefined-label' | 'duplicate-label'
  | 'jump-to-missing-label' | 'stack-imbalance' | 'unreachable' | 'parse-error'
  | 'wont-reproduce' | 'no-make-space' | 'no-loop' | 'no-self-location';

export interface Diagnostic {
  code: DiagCode;
  severity: Severity;
  span: SourceSpan;
  message: string;       // plain, ages 8-16 (C-GS-KID)
  suggestion?: string;
  hoverTerms?: string[];
  teaches?: boolean;
}
export function isError(d: Diagnostic): boolean { return d.severity === 'error'; }
export function hasErrors(ds: readonly Diagnostic[]): boolean { return ds.some(isError); }

// ---- AST ----
export interface LabelDef    { kind: 'label';   name: string; nodeId: NodeId; loc: Loc; }
export interface VerbStmt    { kind: 'verb';    verb: string; nodeId: NodeId; loc: Loc; }
export interface ControlStmt { kind: 'control'; verb: string; target: string | null; nodeId: NodeId; loc: Loc; }
export interface RawStmt     { kind: 'raw';     mnemonic: string; nodeId: NodeId; loc: Loc; }
export interface ErrorStmt   { kind: 'error';   raw: string; diagnostic: Diagnostic; nodeId: NodeId; loc: Loc; }
export type Stmt = LabelDef | VerbStmt | ControlStmt | RawStmt | ErrorStmt;

export interface Program {
  statements: Stmt[];        // source order; blank/comment lines produce no Stmt
  diagnostics: Diagnostic[]; // parser-level, best-effort
}

// ---- Compile surface (COMP/DISASM share these) ----
export interface ByteRange { stmt: number; start: number; end: number } // end exclusive
export interface SourceMap {
  ranges: ReadonlyArray<ByteRange>;
  statementAt(offset: number): number; // which statement owns the byte at offset (-1 if none)
}
export interface CompileResult {
  bytes: Uint8Array;
  sourceMap: SourceMap;
  diagnostics: Diagnostic[];
}
