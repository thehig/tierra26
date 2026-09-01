// ============================================================================
// DOCLANG — `docs/**/*.md` -> typed Doc AST + authoring diagnostics.
//
// A doc is frontmatter + a markdown body in which any block may be a component
// tag, and any sentence may carry an inline one. It is the single authored
// format behind BOTH the Bible (opcode/concept definitions, which double as
// hover tooltips) and the waypoint-guided lessons.
//
// Two levels, because the language needs both:
//   BLOCK  tags own a whole line and may contain children:
//            <Scrolly> <Stage> <Waypoint> <EntityDesigner> <Challenge> ...
//   INLINE tags live inside a sentence:
//            "<Chip opcode="jmpb">top</Chip> sends the reading head back"
// Which is which comes from the manifest (`inline`), never from the parser.
//
// CONTRACTS
//   C-CON-DATA  declarative only — the grammar admits prose, tags and refs,
//               never an executable form; `hasExecutable` rejects the rest.
//   C-CON-DET   parse is a pure function of the source bytes: same input ->
//               identical AST and diagnostics, in source order.
//   C-CON-SOURCE the parser resolves NO id. It records references; existence
//               is validate()'s job, through a caller-supplied DocResolver.
//   Error-tolerant: parseDoc never throws. Malformed input becomes an
//   ErrorNode carrying a Diagnostic, and parsing continues with the next block,
//   so an authoring tool always has a tree to render.
//
// IMPORT RULE (load-bearing): this module and its imports are bundled into the
// Vite config graph, where every VALUE import becomes a config dependency that
// restarts the dev server when edited. Import types only, plus the ./parseval.ts
// and ./manifest.ts leaves. Never value-import ./content.ts — that reaches
// goal.ts -> engine and would make every engine edit restart the server.
// It must also stay browser-safe (no node builtins): the same parser runs in
// the future in-app authoring sandbox.
// ============================================================================

import type {
  Diagnostic,
  DiagCode,
  DocAst,
  DocKind,
  DocNode,
  DocParseResult,
  DocProseNode,
  DocTagNode,
  DocErrorNode,
  Loc,
  Severity,
  StageEvent,
} from './types.ts';
import {
  type PValue,
  diag,
  hasExecutable,
  indexOfTopLevelColon,
  loc,
  parseValueString,
  stripQuotes,
} from './parseval.ts';
import {
  GOAL_PARAMS,
  MANIFEST,
  canonicalTag,
  isRawTag,
  type TagSpec,
} from './manifest.ts';

// ---------------------------------------------------------------------------
// Inline segments — the ONE scanner both the validator and the renderer use.
// Keeping this in the parser (rather than re-implementing it in MiniMark) is
// what stops "what validated" and "what rendered" from drifting apart.
// ---------------------------------------------------------------------------
export type InlineSegment =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'keyword'; term: string }
  | { kind: 'tag'; name: string; attrs: Readonly<Record<string, PValue>>; text?: string };

/** True when the manifest marks `name` as an inline tag. */
export function isInlineTag(name: string): boolean {
  return MANIFEST[name]?.inline === true;
}

const OPEN_TAG_RE = /^<([A-Za-z][A-Za-z0-9-]*)((?:\s[^>]*?)?)(\/?)>/;

/**
 * Split one run of prose into text / `code` / {term} / inline-tag segments.
 * Never throws; an unterminated construct is emitted as plain text.
 */
export function splitInline(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ kind: 'text', text: buf });
    buf = '';
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i]!;

    if (c === '`') {
      const j = text.indexOf('`', i + 1);
      if (j > i) {
        flush();
        out.push({ kind: 'code', text: text.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    } else if (c === '{') {
      const j = text.indexOf('}', i + 1);
      if (j > i) {
        const term = text.slice(i + 1, j);
        if (/^[A-Za-z][\w-]*$/.test(term)) {
          flush();
          out.push({ kind: 'keyword', term });
          i = j + 1;
          continue;
        }
      }
    } else if (c === '<') {
      const m = OPEN_TAG_RE.exec(text.slice(i));
      const canon = m ? canonicalTag(m[1]!) : undefined;
      if (m && canon && isInlineTag(canon)) {
        const attrs = readAttrs(m[2] ?? '');
        if (m[3] === '/') {
          flush();
          out.push({ kind: 'tag', name: canon, attrs });
          i += m[0].length;
          continue;
        }
        // paired form: <Chip ...>label</Chip>
        const rest = text.slice(i + m[0].length);
        const close = rest.indexOf(`</${m[1]!}>`);
        if (close >= 0) {
          flush();
          out.push({ kind: 'tag', name: canon, attrs, text: rest.slice(0, close) });
          i += m[0].length + close + m[1]!.length + 3;
          continue;
        }
      }
    }

    buf += c;
    i++;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------
const ATTR_RE = /([A-Za-z_][A-Za-z0-9_-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/** Parse an attribute string into declarative values. A bare attribute is `true`. */
export function readAttrs(src: string): Record<string, PValue> {
  const attrs: Record<string, PValue> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(src)) !== null) {
    const key = m[1]!;
    const raw = m[2] ?? m[3] ?? m[4];
    attrs[key] = raw === undefined ? true : parseValueString(raw);
  }
  return attrs;
}

// ---------------------------------------------------------------------------
// Raw-text helpers
// ---------------------------------------------------------------------------
/** Strip the common indent and any blank leading/trailing lines. */
export function dedent(lines: readonly string[]): string {
  const body = [...lines];
  while (body.length && body[0]!.trim() === '') body.shift();
  while (body.length && body[body.length - 1]!.trim() === '') body.pop();
  if (!body.length) return '';
  let indent = Infinity;
  for (const l of body) {
    if (l.trim() === '') continue;
    indent = Math.min(indent, l.length - l.trimStart().length);
  }
  if (!Number.isFinite(indent)) indent = 0;
  return body.map((l) => l.slice(indent)).join('\n');
}

// ---------------------------------------------------------------------------
// parseDoc
// ---------------------------------------------------------------------------
const BLOCK_OPEN_RE = /^(\s*)<([A-Za-z][A-Za-z0-9-]*)((?:\s[^>]*?)?)(\/?)>\s*$/;
const BLOCK_CLOSE_RE = /^\s*<\/([A-Za-z][A-Za-z0-9-]*)>\s*$/;
const ANY_OPEN_RE = /^\s*<([A-Za-z][A-Za-z0-9-]*)[\s/>]/;

export interface DocMeta {
  kind: DocKind;
  slug: string;
  file: string; // repo-relative, forward slashes
}

export function parseDoc(source: string, meta: DocMeta): DocParseResult {
  const diagnostics: Diagnostic[] = [];
  let frontmatter: Readonly<Record<string, PValue>> | null = null;
  let body: DocNode[] = [];

  try {
    const lines = source.split(/\r?\n/);

    // --- frontmatter fence ---------------------------------------------------
    let first = 0;
    while (first < lines.length && lines[first]!.trim() === '') first++;

    let start = 0;
    if (first < lines.length && lines[first]!.trim() === '---') {
      let close = -1;
      for (let i = first + 1; i < lines.length; i++) {
        if (lines[i]!.trim() === '---') {
          close = i;
          break;
        }
      }
      if (close === -1) {
        diagnostics.push(
          diag(
            'frontmatter-required',
            'error',
            'The frontmatter block starts with --- but is never closed with a matching ---.',
            loc(first + 1, 1, 4),
          ),
        );
        start = first + 1;
      } else {
        frontmatter = readFrontmatter(lines, first + 1, close, diagnostics);
        start = close + 1;
      }
    } else {
      diagnostics.push(
        diag(
          'frontmatter-required',
          'error',
          'This document has no frontmatter block. Add a --- ... --- block at the top.',
          loc(1, 1, 1),
        ),
      );
    }

    body = parseBlocks(lines, start, lines.length, diagnostics);
  } catch (err) {
    // parseDoc must never throw — surface the failure as a single ErrorNode.
    const l = loc(1, 1, 1);
    const node: DocErrorNode = {
      kind: 'error',
      raw: source,
      diagnostic: diag(
        'malformed-directive',
        'error',
        'This document could not be parsed: ' + (err instanceof Error ? err.message : String(err)),
        l,
      ),
      loc: l,
    };
    body = [node];
    diagnostics.push(node.diagnostic);
  }

  return { ast: { ...meta, frontmatter, body }, diagnostics };
}

function readFrontmatter(
  lines: readonly string[],
  from: number,
  to: number,
  diagnostics: Diagnostic[],
): Readonly<Record<string, PValue>> {
  const fm: Record<string, PValue> = {};
  for (let i = from; i < to; i++) {
    const raw = lines[i]!;
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue;
    const ci = indexOfTopLevelColon(raw);
    if (ci < 0) continue; // not a key: value line — lenient, as [01] is
    const key = raw.slice(0, ci).trim();
    const valueRaw = raw.slice(ci + 1);
    if (hasExecutable(valueRaw)) {
      diagnostics.push(
        diag(
          'executable-content',
          'error',
          `The frontmatter value for "${key}" looks like executable code. Document data must be plain, declarative values only.`,
          loc(i + 1, 1, raw.length + 1),
        ),
      );
      continue;
    }
    fm[key] = parseValueString(valueRaw);
  }
  return fm;
}

/** Parse `[from, to)` into an ordered list of prose and tag nodes. */
function parseBlocks(
  lines: readonly string[],
  from: number,
  to: number,
  diagnostics: Diagnostic[],
): DocNode[] {
  const out: DocNode[] = [];
  let proseStart = -1;

  const flushProse = (end: number) => {
    if (proseStart < 0) return;
    const slice = lines.slice(proseStart, end);
    if (slice.some((l) => l.trim() !== '')) {
      out.push(makeProse(slice, proseStart));
    }
    proseStart = -1;
  };

  let i = from;
  while (i < to) {
    const line = lines[i]!;
    const open = BLOCK_OPEN_RE.exec(line);
    const canon = open ? canonicalTag(open[2]!) : undefined;

    // An inline tag alone on a line is still prose — the inline scanner owns it.
    if (open && canon && !isInlineTag(canon)) {
      flushProse(i);
      const res = readTag(lines, i, to, canon, open, diagnostics);
      out.push(res.node);
      i = res.next;
      continue;
    }

    // A known block tag that does not own its whole line is an authoring slip
    // worth naming, rather than silently rendering as prose.
    if (!open) {
      const any = ANY_OPEN_RE.exec(line);
      const c2 = any ? canonicalTag(any[1]!) : undefined;
      if (c2 && !isInlineTag(c2) && !BLOCK_CLOSE_RE.test(line)) {
        flushProse(i);
        const l = loc(i + 1, 1, line.length + 1);
        const node: DocErrorNode = {
          kind: 'error',
          raw: line,
          diagnostic: diag(
            'malformed-directive',
            'error',
            `<${c2}> is a block component, so it needs a line of its own — move everything after the ">" onto the next line.`,
            l,
          ),
          loc: l,
        };
        out.push(node);
        diagnostics.push(node.diagnostic);
        i++;
        continue;
      }
    }

    // A stray close tag with no opener.
    const close = BLOCK_CLOSE_RE.exec(line);
    if (close && canonicalTag(close[1]!)) {
      flushProse(i);
      const l = loc(i + 1, 1, line.length + 1);
      const node: DocErrorNode = {
        kind: 'error',
        raw: line,
        diagnostic: diag(
          'malformed-directive',
          'error',
          `</${close[1]!}> closes a component that was never opened here.`,
          l,
        ),
        loc: l,
      };
      out.push(node);
      diagnostics.push(node.diagnostic);
      i++;
      continue;
    }

    if (proseStart < 0) proseStart = i;
    i++;
  }
  flushProse(to);
  return out;
}

interface TagRead {
  node: DocNode;
  next: number;
}

function readTag(
  lines: readonly string[],
  at: number,
  to: number,
  name: string,
  open: RegExpExecArray,
  diagnostics: Diagnostic[],
): TagRead {
  const line = lines[at]!;
  const l = loc(at + 1, (open[1] ?? '').length + 1, line.length + 1);
  const attrs = readAttrs(open[3] ?? '');

  if (hasExecutable(line)) {
    const d = diag(
      'executable-content',
      'error',
      `<${name}> carries something that looks like executable code. Components take plain, declarative attributes only.`,
      l,
    );
    diagnostics.push(d);
    return { node: { kind: 'error', raw: line, diagnostic: d, loc: l }, next: at + 1 };
  }

  // Self-closing.
  if (open[4] === '/') {
    return { node: { kind: 'tag', name, attrs, children: [], loc: l }, next: at + 1 };
  }

  // Find the matching close, honouring nesting of the same tag.
  const rawName = open[2]!;
  let depth = 1;
  let closeAt = -1;
  for (let i = at + 1; i < to; i++) {
    const s = lines[i]!;
    const c = BLOCK_CLOSE_RE.exec(s);
    if (c && canonicalTag(c[1]!) === name) {
      depth--;
      if (depth === 0) {
        closeAt = i;
        break;
      }
      continue;
    }
    const o = BLOCK_OPEN_RE.exec(s);
    if (o && canonicalTag(o[2]!) === name && o[4] !== '/') depth++;
  }

  if (closeAt < 0) {
    const d = diag(
      'malformed-directive',
      'error',
      `<${rawName}> is never closed. Add a </${rawName}> line.`,
      l,
    );
    diagnostics.push(d);
    return { node: { kind: 'error', raw: line, diagnostic: d, loc: l }, next: at + 1 };
  }

  // Raw tags keep their body verbatim — genome source must never be touched.
  if (isRawTag(name)) {
    const text = dedent(lines.slice(at + 1, closeAt));
    return { node: { kind: 'tag', name, attrs, children: [], text, loc: l }, next: closeAt + 1 };
  }

  const children = parseBlocks(lines, at + 1, closeAt, diagnostics);
  return { node: { kind: 'tag', name, attrs, children, loc: l }, next: closeAt + 1 };
}

function makeProse(slice: readonly string[], startLine: number): DocProseNode {
  const markdown = slice.join('\n');
  const refs: DocProseNode['refs'] = [];
  for (let k = 0; k < slice.length; k++) {
    const lineNo = startLine + k + 1;
    let col = 1;
    for (const seg of splitInline(slice[k]!)) {
      const width =
        seg.kind === 'text'
          ? seg.text.length
          : seg.kind === 'code'
            ? seg.text.length + 2
            : seg.kind === 'keyword'
              ? seg.term.length + 2
              : 0;
      if (seg.kind === 'keyword') {
        refs.push({ kind: 'keyword', term: seg.term, loc: loc(lineNo, col, col + width) });
      } else if (seg.kind === 'tag') {
        // exactOptionalPropertyTypes: only carry `text` when the tag had a label.
        refs.push(
          seg.text === undefined
            ? { kind: 'tag', name: seg.name, attrs: seg.attrs, loc: loc(lineNo, col, col + 1) }
            : {
                kind: 'tag',
                name: seg.name,
                attrs: seg.attrs,
                text: seg.text,
                loc: loc(lineNo, col, col + 1),
              },
        );
      }
      col += width;
    }
  }
  return {
    kind: 'prose',
    markdown,
    refs,
    loc: loc(startLine + 1, 1, (slice[slice.length - 1]?.length ?? 0) + 1),
  };
}

// ---------------------------------------------------------------------------
// validateDoc
// ---------------------------------------------------------------------------

/** Existence checks the validator delegates to the caller (C-CON-SOURCE): the
 *  parser holds no id lists, so nothing here knows what a real opcode is. */
export interface DocResolver {
  isOpcode(token: string): boolean; // an engine mnemonic OR its bound display name
  hasConcept(slug: string): boolean;
  hasGenome(id: string): boolean;
  hasScenario(id: string): boolean;
  hasSubset(name: string): boolean;
  hasSnapshot(id: string): boolean;
  hasLesson(id: string): boolean;
}

/** Frontmatter keys each document kind must carry. */
const REQUIRED_FRONTMATTER: Readonly<Record<DocKind, readonly string[]>> = Object.freeze({
  opcode: ['mnemonic', 'name', 'category'],
  concept: ['slug', 'title'],
  lesson: ['id', 'title'],
});

export function validateDoc(ast: DocAst, resolver: DocResolver): Diagnostic[] {
  const out: Diagnostic[] = [];

  // -- frontmatter ------------------------------------------------------------
  if (ast.frontmatter) {
    for (const key of REQUIRED_FRONTMATTER[ast.kind]) {
      if (!(key in ast.frontmatter)) {
        out.push(
          diag('missing-field', 'error', `Frontmatter is missing "${key}".`, loc(1, 1, 1)),
        );
      }
    }
    // The filename is the id: a mismatch silently breaks every cross-link.
    const idKey = ast.kind === 'opcode' ? 'mnemonic' : ast.kind === 'concept' ? 'slug' : 'id';
    const id = ast.frontmatter[idKey];
    if (typeof id === 'string' && id !== ast.slug) {
      out.push(
        diag(
          'bad-enum',
          'error',
          `Frontmatter ${idKey} is "${id}" but the file is named "${ast.slug}.md" — they must match.`,
          loc(1, 1, 1),
        ),
      );
    }
  }

  walk(ast.body, null, out, resolver);
  return out;
}

function walk(
  nodes: readonly DocNode[],
  parent: string | null,
  out: Diagnostic[],
  resolver: DocResolver,
): void {
  for (const node of nodes) {
    if (node.kind === 'error') continue; // already diagnosed at parse time
    if (node.kind === 'prose') {
      for (const ref of node.refs) {
        if (ref.kind === 'tag') {
          checkTag(ref.name, ref.attrs, ref.loc, parent, out, resolver);
        } else if (ref.kind === 'keyword' && !resolver.hasConcept(ref.term)) {
          out.push(
            diag(
              'unknown-keyword',
              'warning',
              `{${ref.term}} is not a concept we know — check the spelling, or add docs/bible/concepts/${ref.term}.md.`,
              ref.loc,
            ),
          );
        }
      }
      continue;
    }

    const spec = checkTag(node.name, node.attrs, node.loc, parent, out, resolver);
    if (!spec) continue;

    // -- children ------------------------------------------------------------
    const rule = spec.children;
    if (rule === 'none' && (node.children.length || node.text)) {
      out.push(
        diag('malformed-directive', 'error', `<${node.name}> takes no content.`, node.loc),
      );
    }
    if (Array.isArray(rule)) {
      for (const child of node.children) {
        if (child.kind === 'tag' && !rule.includes(child.name)) {
          out.push(
            diag(
              'malformed-directive',
              'error',
              `<${child.name}> cannot go inside <${node.name}>. Allowed here: ${rule.join(', ')}.`,
              child.loc,
            ),
          );
        }
      }
    } else if (rule === 'prose') {
      for (const child of node.children) {
        if (child.kind === 'tag') {
          out.push(
            diag(
              'malformed-directive',
              'error',
              `<${node.name}> holds prose only — <${child.name}> cannot go inside it.`,
              child.loc,
            ),
          );
        }
      }
    }

    walk(node.children, node.name, out, resolver);
  }
}

function checkTag(
  name: string,
  attrs: Readonly<Record<string, PValue>>,
  at: Loc,
  parent: string | null,
  out: Diagnostic[],
  resolver: DocResolver,
): TagSpec | undefined {
  const spec = MANIFEST[name];
  if (!spec) {
    out.push(diag('unknown-tag', 'error', `<${name}> is not a component we know.`, at));
    return undefined;
  }

  if (spec.parents && (!parent || !spec.parents.includes(parent))) {
    out.push(
      diag(
        'malformed-directive',
        'error',
        `<${name}> only works inside ${spec.parents.map((p) => `<${p}>`).join(' or ')}.`,
        at,
      ),
    );
  }

  for (const [key, spec_] of Object.entries(spec.attrs)) {
    if (spec_.required && !(key in attrs)) {
      out.push(diag('missing-field', 'error', `<${name}> needs a "${key}" attribute.`, at));
    }
  }
  for (const [key, value] of Object.entries(attrs)) {
    const aspec = spec.attrs[key];
    if (!aspec) {
      out.push(
        diag(
          'bad-attr',
          'warning',
          `<${name}> has no "${key}" attribute — check for a typo. Known: ${Object.keys(spec.attrs).join(', ') || '(none)'}.`,
          at,
        ),
      );
      continue;
    }
    checkAttrValue(name, key, value, aspec.type, aspec.values, at, out, resolver);
  }

  if (spec.oneOf && !spec.oneOf.some((group) => group.every((k) => k in attrs))) {
    out.push(
      diag(
        'missing-field',
        'error',
        `<${name}> needs one of: ${spec.oneOf.map((g) => g.join('+')).join(', ')}.`,
        at,
      ),
    );
  }

  if (name === 'Goal') checkGoal(attrs, at, out);
  return spec;
}

function checkAttrValue(
  tag: string,
  key: string,
  value: PValue,
  type: string,
  values: readonly string[] | undefined,
  at: Loc,
  out: Diagnostic[],
  resolver: DocResolver,
): void {
  const bad = (msg: string, code: DiagCode = 'bad-attr', sev: Severity = 'error') =>
    out.push(diag(code, sev, `<${tag}> ${key}: ${msg}`, at));
  const str = typeof value === 'string' ? value : String(value);

  switch (type) {
    case 'int':
      if (typeof value !== 'number' || !Number.isInteger(value)) bad(`"${str}" is not a whole number.`);
      break;
    case 'bool':
      if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
        bad(`"${str}" is not true or false.`);
      }
      break;
    case 'enum':
      if (values && !values.includes(str)) {
        bad(`"${str}" is not one of: ${values.join(', ')}.`, 'bad-enum');
      }
      break;
    case 'string[]':
      if (!Array.isArray(value) && typeof value !== 'string') bad(`"${str}" is not a list.`);
      break;
    case 'opcode':
      if (!resolver.isOpcode(str)) bad(`"${str}" is not an instruction this engine has.`, 'unknown-verb');
      break;
    case 'register':
      if (!['A', 'B', 'C', 'D'].includes(str)) bad(`"${str}" is not a register (A, B, C or D).`, 'bad-enum');
      break;
    case 'flag':
      if (!['E', 'S', 'Z'].includes(str)) bad(`"${str}" is not a flag (E, S or Z).`, 'bad-enum');
      break;
    case 'concept':
      if (!resolver.hasConcept(str)) bad(`"${str}" has no concept page.`, 'unknown-keyword');
      break;
    case 'string':
      // Named-reference attributes are checked against the caller's registries.
      if (key === 'ref' && !resolver.hasGenome(str)) bad(`"${str}" is not a named genome.`, 'unknown-starter');
      if (key === 'starter' && !resolver.hasGenome(str)) bad(`"${str}" is not a named genome.`, 'unknown-starter');
      if (key === 'scenario' && !resolver.hasScenario(str)) bad(`"${str}" is not a scenario.`, 'unknown-scenario');
      if (key === 'subset' && !resolver.hasSubset(str)) bad(`"${str}" is not an instruction subset.`, 'unknown-subset');
      if (key === 'snapshot' && !resolver.hasSnapshot(str)) bad(`"${str}" is not a saved snapshot.`, 'unknown-snapshot');
      break;
    default:
      break;
  }
}

function checkGoal(attrs: Readonly<Record<string, PValue>>, at: Loc, out: Diagnostic[]): void {
  const kind = typeof attrs['kind'] === 'string' ? (attrs['kind'] as string) : '';
  const params = GOAL_PARAMS[kind];
  if (!params) return; // the enum check already reported an unknown kind
  for (const p of params) {
    if (!(p in attrs)) {
      out.push(
        diag('invalid-goal', 'error', `A "${kind}" goal needs a "${p}" attribute.`, at),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Small readers the app and the loader share, so "what the tag means" is
// written once rather than in every consumer.
// ---------------------------------------------------------------------------

/** The scroll events a <Waypoint> carries, in a fixed order. */
export function waypointEvents(node: DocTagNode): StageEvent[] {
  const events: StageEvent[] = [];
  const focus = node.attrs['focus'];
  if (typeof focus === 'string') events.push({ kind: 'focus', part: focus });
  const at = node.attrs['at'];
  if (typeof at === 'number') events.push({ kind: 'at', step: at });
  return events;
}

/** Find the first direct child tag with `name`. */
export function childTag(node: DocTagNode, name: string): DocTagNode | undefined {
  for (const c of node.children) if (c.kind === 'tag' && c.name === name) return c;
  return undefined;
}

/** All direct child tags with `name`, in source order. */
export function childTags(node: DocTagNode, name: string): DocTagNode[] {
  return node.children.filter((c): c is DocTagNode => c.kind === 'tag' && c.name === name);
}

/**
 * Split a body at its fold. The point of the fold is that a Bible definition is
 * ONE document serving two surfaces: a hover tooltip and a full page. The
 * tooltip must stay small and must never try to mount a live simulation.
 *
 * An explicit <Fold/> wins. Failing that the cut falls before the first embedded
 * COMPONENT, which is the rule that actually matters — prose is cheap to show in
 * a card, a running creature is not.
 */
export function foldAt(body: readonly DocNode[]): { above: DocNode[]; below: DocNode[] } {
  const marker = body.findIndex((n) => n.kind === 'tag' && n.name === 'Fold');
  if (marker >= 0) return { above: body.slice(0, marker), below: body.slice(marker + 1) };
  const firstTag = body.findIndex((n) => n.kind === 'tag');
  if (firstTag < 0) return { above: [...body], below: [] };
  return { above: body.slice(0, firstTag), below: body.slice(firstTag) };
}

/**
 * The markdown of one `## Heading` section of a document, heading excluded.
 *
 * The Bible has a fixed shape — Simple / Advanced / Reads-Writes-Flags /
 * Gotchas / See also — and different surfaces want different slices of it: a
 * tooltip wants `Simple` (or `Advanced` when the reader has flipped to machine
 * names), the page wants all of it. Returns undefined when there is no such
 * section, so a caller can fall back rather than render an empty box.
 */
export function sectionOf(body: readonly DocNode[], heading: string): string | undefined {
  const want = heading.trim().toLowerCase();
  for (const node of body) {
    if (node.kind !== 'prose') continue;
    const lines = node.markdown.split('\n');
    let start = -1;
    let level = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]!.trim());
      if (!m) continue;
      if (start < 0) {
        if (m[2]!.trim().toLowerCase() === want) {
          start = i + 1;
          level = m[1]!.length;
        }
        continue;
      }
      // stop at the next heading of the same or shallower depth
      if (m[1]!.length <= level) {
        return lines.slice(start, i).join('\n').trim() || undefined;
      }
    }
    if (start >= 0) return lines.slice(start).join('\n').trim() || undefined;
  }
  return undefined;
}

export { stripQuotes };
