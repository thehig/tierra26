// GeneScript front end (GS) — the lexer + parser. Text in, tokens + best-effort AST out.
// Pure & stateless (C-GS-DET): same source → identical tokens / statements / diagnostics, in
// source order. Never throws (C-GS-ERR): malformed lines become diagnostic-bearing ErrorStmt
// nodes so the editor always has a tree. Knows syntax, not opcodes (C-GS-NOOPCODES): control-
// vs-verb classification is delegated to the vocabulary table ([02]).
// Spec: docs/spec/genescript/01-language-and-syntax.md (§2 concrete form, §4 algorithm, §8 GS-*).
import type {
  Token, Program, Stmt, Diagnostic, Loc, NodeId,
} from './types.ts';
import { takesTarget } from './vocab.ts';

// ---- lexer character classes ----
const isIdentChar = (c: string): boolean =>
  (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '-' || c === '_';
// spaces, tabs and CR are insignificant word separators (§6); only \n ends a line.
const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\r';

/**
 * lex — one linear pass, no lookahead. Never throws; an unrecognized char becomes a
 * single-char Token{kind:'error'} and lexing continues (error tolerance, §4).
 * newline and comment tokens are retained (the parser drops comments, segments on newlines).
 */
export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  const n = source.length;
  let i = 0, line = 1, col = 1;
  while (i < n) {
    const c = source[i]!;
    if (c === '\n') {
      tokens.push({ kind: 'newline', text: '\n', line, col });
      i++; line++; col = 1; continue;
    }
    if (c === '#') { // comment: consume to end of line (exclusive of \n)
      const startCol = col;
      let text = '';
      while (i < n && source[i] !== '\n') { text += source[i]; i++; col++; }
      tokens.push({ kind: 'comment', text, line, col: startCol }); continue;
    }
    if (c === ':') {
      tokens.push({ kind: 'colon', text: ':', line, col });
      i++; col++; continue;
    }
    if (isSpace(c)) { i++; col++; continue; } // insignificant; ends the current word
    if (isIdentChar(c)) {
      const startCol = col;
      let text = '';
      while (i < n && isIdentChar(source[i]!)) { text += source[i]; i++; col++; }
      tokens.push({ kind: 'word', text, line, col: startCol }); continue;
    }
    // anything else → single-char error token, keep going (tolerance)
    tokens.push({ kind: 'error', text: c, line, col });
    i++; col++;
  }
  tokens.push({ kind: 'eof', text: '', line, col });
  return tokens;
}

/**
 * parse — best-effort program AST. Never throws. Blank/comment-only lines produce no Stmt.
 * Each Stmt gets a source-order nodeId (s0, s1, …) and a Loc (the source-map seed).
 */
export function parse(source: string): Program {
  const tokens = lex(source);
  const statements: Stmt[] = [];
  const diagnostics: Diagnostic[] = [];
  let counter = 0;
  const nextId = (): NodeId => `s${counter++}`;

  const locOf = (parts: Token[], nodeId: NodeId): Loc => {
    const first = parts[0]!;
    const last = parts[parts.length - 1]!;
    return { line: first.line, colStart: first.col, colEnd: last.col + last.text.length, nodeId };
  };
  const rawTextOf = (parts: Token[]): string => parts.map((p) => p.text).join(' ');

  const pushError = (parts: Token[], message: string): void => {
    const nodeId = nextId();
    const loc = locOf(parts, nodeId);
    const diagnostic: Diagnostic = { code: 'parse-error', severity: 'error', span: loc, message };
    statements.push({ kind: 'error', raw: rawTextOf(parts), diagnostic, nodeId, loc });
    diagnostics.push(diagnostic);
  };

  const processLine = (lineTokens: Token[]): void => {
    // comments are lexed then discarded — they never reach the AST (§3)
    const parts = lineTokens.filter((t) => t.kind !== 'comment');
    if (parts.length === 0) return; // blank / comment-only → no Stmt

    // unknown-char tokens make the whole line unparseable
    if (parts.some((p) => p.kind === 'error')) {
      pushError(parts, 'This line has a character I do not understand.');
      return;
    }

    // `name:` → LabelDef (checked before `raw`, so a label literally named `raw:` stays a label, §6)
    if (parts.length === 2 && parts[0]!.kind === 'word' && parts[1]!.kind === 'colon') {
      const nodeId = nextId();
      const loc = locOf(parts, nodeId);
      statements.push({ kind: 'label', name: parts[0]!.text, nodeId, loc }); // original casing preserved
      return;
    }

    // any other appearance of `:` is a stray colon
    if (parts.some((p) => p.kind === 'colon')) {
      pushError(parts, 'I found a stray ":" here.');
      return;
    }

    // only word tokens remain
    const words = parts; // all 'word' at this point

    // `raw <mnemonic>` — the only way to write nop0/nop1 (worded surface hides templates, §7)
    if (words[0]!.text.toLowerCase() === 'raw') {
      if (words.length === 2) {
        const nodeId = nextId();
        const loc = locOf(parts, nodeId);
        statements.push({ kind: 'raw', mnemonic: words[1]!.text.toLowerCase(), nodeId, loc });
      } else {
        pushError(parts, 'raw needs exactly one instruction after it.');
      }
      return;
    }

    if (words.length === 1) {
      const verb = words[0]!.text.toLowerCase(); // canonicalize keyword casing
      const nodeId = nextId();
      const loc = locOf(parts, nodeId);
      if (takesTarget(verb)) {
        // best-effort node; DIAG owns the richer "missing target" message downstream
        statements.push({ kind: 'control', verb, target: null, nodeId, loc });
        diagnostics.push({
          code: 'parse-error', severity: 'error', span: loc,
          message: `"${verb}" needs a landmark to point at.`,
        });
      } else {
        statements.push({ kind: 'verb', verb, nodeId, loc });
      }
      return;
    }

    if (words.length === 2) {
      const verb = words[0]!.text.toLowerCase();
      if (takesTarget(verb)) {
        const nodeId = nextId();
        const loc = locOf(parts, nodeId);
        statements.push({ kind: 'control', verb, target: words[1]!.text, nodeId, loc }); // target casing preserved
      } else {
        pushError(parts, `"${verb}" does not take anything after it.`);
      }
      return;
    }

    // three or more words on one line
    pushError(parts, 'This line has too many words.');
  };

  let lineTokens: Token[] = [];
  for (const t of tokens) {
    if (t.kind === 'newline' || t.kind === 'eof') {
      processLine(lineTokens);
      lineTokens = [];
    } else {
      lineTokens.push(t);
    }
  }

  return { statements, diagnostics };
}
