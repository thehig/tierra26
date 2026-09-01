// ============================================================================
// Shared declarative-value primitives for the content parsers.
//
// This is a LEAF module on purpose: it imports only TYPES, never values. Both
// [01] CONTENT (content.ts, the `:::` lesson format) and DOCLANG (doclang.ts,
// the `<Tag>` document format) build on it, and doclang must not reach into
// content.ts — that would drag goal.ts -> engine into the build-time config
// graph and make every engine edit restart the dev server.
//
// Scalars, string lists, and one level of nested map. No expressions, no code
// (C-CON-DATA). Quote- and bracket-aware, so `reads: [C]`, `flags: [E, S, Z]`
// and `unlocks: { verbs: [a, b] }` all parse without a YAML dependency.
// ============================================================================

import type { DiagCode, Diagnostic, Loc, Severity } from './types.ts';

export type PValue = string | number | boolean | PValue[] | { [k: string]: PValue };

/** Split `s` on top-level occurrences of `sep`, ignoring separators inside quotes/[]/{}. */
export function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === sep && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

/** Index of the first top-level ':' (key/value separator), or -1. Respects quotes/brackets. */
export function indexOfTopLevelColon(s: string): number {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quote) {
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0) return i;
  }
  return -1;
}

export function stripQuotes(s: string): string {
  const t = s.trim();
  if (
    t.length >= 2 &&
    ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseScalar(s: string): string | number | boolean {
  const t = stripQuotes(s);
  if (/^-?\d+$/.test(t)) return Number(t);
  // Only the exact literals coerce. 'on'/'off' (the mutation enum) and every
  // other bare word stay strings, so the [01] frontmatter schema is unchanged.
  if (t === 'true') return true;
  if (t === 'false') return false;
  return t;
}

export function parseValueString(raw: string): PValue {
  const s = raw.trim();
  if (s.startsWith('[')) {
    const close = s.lastIndexOf(']');
    const inner = s.slice(1, close < 0 ? s.length : close);
    if (inner.trim() === '') return [];
    return splitTopLevel(inner, ',')
      .filter((p) => p.trim() !== '')
      .map((p) => parseValueString(p));
  }
  if (s.startsWith('{')) {
    const close = s.lastIndexOf('}');
    const inner = s.slice(1, close < 0 ? s.length : close);
    const obj: { [k: string]: PValue } = {};
    if (inner.trim() === '') return obj;
    for (const pair of splitTopLevel(inner, ',')) {
      if (pair.trim() === '') continue;
      const ci = indexOfTopLevelColon(pair);
      if (ci < 0) continue;
      const key = stripQuotes(pair.slice(0, ci).trim());
      obj[key] = parseValueString(pair.slice(ci + 1));
    }
    return obj;
  }
  return parseScalar(s);
}

// ---------------------------------------------------------------------------
// Declarative-only guard (C-CON-DATA): reject any injected executable form.
// ---------------------------------------------------------------------------
const EXEC_PATTERNS: RegExp[] = [
  /<script\b/i,
  /<\/script>/i,
  /javascript:/i,
  /\son(?:click|error|load|mouseover|mouseout|focus|blur|change|submit|input|keydown|keyup)\s*=/i,
  /\$\{/, // template-literal expression
  /=>/, // arrow function
  /\bfunction\s*\(/,
];
export function hasExecutable(text: string): boolean {
  return EXEC_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------------------
// Diagnostics helpers
// ---------------------------------------------------------------------------
export function diag(code: DiagCode, severity: Severity, message: string, loc: Loc): Diagnostic {
  return { code, severity, message, loc };
}
export function loc(line: number, startCol: number, endCol: number): Loc {
  return { line, startCol, endCol };
}
