// [01] CONTENT — lesson source → typed Lesson AST + validation.
// Ref: docs/spec/content/01-content-model-and-authoring.md (§2 signatures, §3 concrete format,
//      §4 rules, §8 acceptance). Shapes are the LOCKED foundation in ./types.ts — imported, not
//      redefined. This layer records structure + references only; it resolves no id and consults
//      no registry (C-CON-SOURCE). parse() is a pure function of source text (C-CON-DET) and
//      NEVER throws — malformed input becomes an ErrorNode + Diagnostic and later blocks parse on.
//      validate() is the schema + binding pass; existence checks go through a caller IdResolver.
//
// The ONLY vocabulary the parser is allowed to consult is the language's fixed classic-32 verb
// set (to decide whether a `backtick` span is an instruction link) — every other existence check
// (scenario/starter/subset/prereq/keyword) is validate()'s job via the resolver.

import type {
  ParseResult,
  LessonAst,
  Frontmatter,
  ScenarioDefaults,
  BodyNode,
  ProseNode,
  PlaygroundNode,
  GoalNode,
  ErrorNode,
  InlineRef,
  Loc,
  Diagnostic,
  DiagCode,
  Severity,
  IdResolver,
  PlaygroundConfig,
  Goal,
  GoalKind,
  GenomeSource,
  ActiveSubset,
} from './types.ts';
import { isVerb } from '../../genescript/src/vocab.ts';
// Per-kind goal-param validation lives in the goal package (single-sourced rules — spec 06 §4/§5).
// content.validate() reuses it so a malformed authored goal is caught at authoring, not at check time.
import { validateGoal as validateGoalParams } from './goal.ts';

// Shared declarative-value primitives (scalars, string lists, one level of nested map) and the
// diagnostics helpers live in the leaf module ./parseval.ts, so DOCLANG can reuse them without
// importing this file (which would pull goal.ts -> engine into the build-time config graph).
import {
  type PValue,
  indexOfTopLevelColon,
  stripQuotes,
  parseValueString,
  hasExecutable,
  diag,
  loc,
} from './parseval.ts';

// ===========================================================================
// parse
// ===========================================================================
export function parse(source: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  let frontmatter: Frontmatter | null = null;
  let body: BodyNode[] = [];

  try {
    const lines = source.split(/\r?\n/);

    // --- 1. frontmatter fence -------------------------------------------------
    let firstIdx = 0;
    while (firstIdx < lines.length && lines[firstIdx]!.trim() === '') firstIdx++;

    let bodyStart = 0;
    if (firstIdx < lines.length && lines[firstIdx]!.trim() === '---') {
      let closeIdx = -1;
      for (let i = firstIdx + 1; i < lines.length; i++) {
        if (lines[i]!.trim() === '---') {
          closeIdx = i;
          break;
        }
      }
      if (closeIdx === -1) {
        diagnostics.push(
          diag(
            'frontmatter-required',
            'error',
            'The frontmatter block starts with --- but is never closed with a matching ---.',
            loc(firstIdx + 1, 1, 4),
          ),
        );
        frontmatter = null;
        bodyStart = firstIdx + 1;
      } else {
        frontmatter = parseFrontmatter(lines, firstIdx + 1, closeIdx, diagnostics);
        bodyStart = closeIdx + 1;
      }
    } else {
      // no fence at all
      diagnostics.push(
        diag(
          'frontmatter-required',
          'error',
          'This lesson has no frontmatter block. Add a --- ... --- block at the top with id, chapter, title, unlocks, requires and mutation.',
          loc(1, 1, 1),
        ),
      );
      frontmatter = null;
      bodyStart = 0;
    }

    // --- 2 + 3. body segmentation + inline refs -------------------------------
    body = parseBody(lines, bodyStart, frontmatter?.defaults, diagnostics);
  } catch (err) {
    // Belt-and-suspenders: parse() must never throw. Surface a single ErrorNode.
    const message =
      'This lesson could not be parsed: ' + (err instanceof Error ? err.message : String(err));
    const l = loc(1, 1, 1);
    const node: ErrorNode = {
      kind: 'error',
      raw: source,
      diagnostic: diag('malformed-directive', 'error', message, l),
      loc: l,
    };
    body = [node];
    diagnostics.push(node.diagnostic);
  }

  const ast: LessonAst = { frontmatter, body };
  return { frontmatter, ast, diagnostics };
}

// ---------------------------------------------------------------------------
// frontmatter
// ---------------------------------------------------------------------------
function parseFrontmatter(
  lines: string[],
  from: number,
  to: number,
  diagnostics: Diagnostic[],
): Frontmatter {
  const fm: Partial<Frontmatter> = {};
  for (let i = from; i < to; i++) {
    const raw = lines[i]!;
    if (raw.trim() === '') continue;
    const ci = indexOfTopLevelColon(raw);
    if (ci < 0) continue; // not a key: value line — ignore (lenient)
    const key = raw.slice(0, ci).trim();
    const valueRaw = raw.slice(ci + 1);
    if (hasExecutable(valueRaw)) {
      diagnostics.push(
        diag(
          'executable-content',
          'error',
          `The frontmatter value for "${key}" looks like executable code. Lesson data must be plain, declarative values only.`,
          loc(i + 1, ci + 2, raw.length + 1),
        ),
      );
      continue;
    }
    const value = parseValueString(valueRaw);
    switch (key) {
      case 'id':
        fm.id = String(value);
        break;
      case 'chapter':
        fm.chapter = typeof value === 'number' ? value : Number(value);
        break;
      case 'title':
        fm.title = String(value);
        break;
      case 'unlocks': {
        const u = value as { verbs?: unknown; concepts?: unknown };
        fm.unlocks = {
          verbs: Array.isArray(u?.verbs) ? u.verbs.map(String) : [],
          concepts: Array.isArray(u?.concepts) ? u.concepts.map(String) : [],
        };
        break;
      }
      case 'requires':
        fm.requires = Array.isArray(value) ? value.map(String) : [];
        break;
      case 'mutation':
        // keep whatever the author wrote (validate closes the enum)
        fm.mutation = String(value) as 'on' | 'off';
        break;
      case 'defaults': {
        const d = value as Record<string, PValue>;
        const sd: ScenarioDefaults = {};
        if (d && typeof d === 'object' && !Array.isArray(d)) {
          if (d.scenario !== undefined) sd.scenario = String(d.scenario);
          if (d.seed !== undefined) sd.seed = Number(d.seed);
          if (d.starter !== undefined) sd.starter = String(d.starter);
          if (d.subset !== undefined) sd.subset = String(d.subset);
        }
        fm.defaults = sd;
        break;
      }
      default:
        // unknown key: a warning (typo-catching), not a hard error
        diagnostics.push(
          diag(
            'unknown-keyword',
            'warning',
            `"${key}" isn't a frontmatter field we recognise — check for a typo.`,
            loc(i + 1, 1, key.length + 1),
          ),
        );
        break;
    }
  }
  return fm as Frontmatter;
}

// ---------------------------------------------------------------------------
// body
// ---------------------------------------------------------------------------
function parseBody(
  lines: string[],
  startIdx: number,
  defaults: ScenarioDefaults | undefined,
  diagnostics: Diagnostic[],
): BodyNode[] {
  const nodes: BodyNode[] = [];
  let i = startIdx;
  let proseFrom = -1;

  const flush = (toExclusive: number) => {
    if (proseFrom === -1) return;
    const node = makeProse(lines, proseFrom, toExclusive, diagnostics);
    if (node) nodes.push(node);
    proseFrom = -1;
  };

  while (i < lines.length) {
    const t = lines[i]!.trim();
    if (t.startsWith(':::')) {
      flush(i);
      const { node, nextIdx } = parseDirective(lines, i, defaults, diagnostics);
      nodes.push(node);
      i = nextIdx;
      continue;
    }
    if (proseFrom === -1) proseFrom = i;
    i++;
  }
  flush(lines.length);
  return nodes;
}

function makeProse(
  lines: string[],
  fromIdx: number,
  toIdx: number,
  diagnostics: Diagnostic[],
): ProseNode | null {
  let a = fromIdx;
  let b = toIdx;
  while (a < b && lines[a]!.trim() === '') a++;
  while (b > a && lines[b - 1]!.trim() === '') b--;
  if (a >= b) return null;
  const markdown = lines.slice(a, b).join('\n');
  if (hasExecutable(markdown)) {
    diagnostics.push(
      diag(
        'executable-content',
        'error',
        'This prose contains an executable form (a script or event handler). Lessons are declarative data — remove it.',
        loc(a + 1, 1, lines[a]!.length + 1),
      ),
    );
  }
  const refs = extractRefs(lines, a, b);
  return {
    kind: 'prose',
    markdown,
    refs,
    loc: loc(a + 1, 1, lines[a]!.length + 1),
  };
}

function extractRefs(lines: string[], a: number, b: number): InlineRef[] {
  const refs: InlineRef[] = [];
  for (let idx = a; idx < b; idx++) {
    const line = lines[idx]!;
    const lineNo = idx + 1;
    let i = 0;
    while (i < line.length) {
      const c = line[i]!;
      if (c === '`') {
        const j = line.indexOf('`', i + 1);
        if (j > i) {
          const content = line.slice(i + 1, j).trim();
          if (content && isVerb(content)) {
            refs.push({ kind: 'code', verb: content, loc: loc(lineNo, i + 1, j + 2) });
          }
          i = j + 1;
          continue;
        }
        i++;
        continue;
      }
      if (c === '{') {
        const j = line.indexOf('}', i + 1);
        if (j > i) {
          const content = line.slice(i + 1, j);
          if (/^[A-Za-z][\w-]*$/.test(content)) {
            refs.push({ kind: 'keyword', term: content, loc: loc(lineNo, i + 1, j + 2) });
          }
          i = j + 1;
          continue;
        }
        i++;
        continue;
      }
      i++;
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// directives
// ---------------------------------------------------------------------------
interface DirectiveResult {
  node: BodyNode;
  nextIdx: number;
}

function directiveConfig(line: string): { config: Record<string, PValue>; exec: boolean; malformed: boolean } {
  const open = line.indexOf('{');
  if (open < 0) return { config: {}, exec: false, malformed: false };
  const close = line.lastIndexOf('}');
  if (close <= open) return { config: {}, exec: false, malformed: true };
  const text = line.slice(open, close + 1);
  let parsed = parseValueString(text);
  if (typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
  return { config: parsed as Record<string, PValue>, exec: hasExecutable(text), malformed: false };
}

function collectUntil(
  lines: string[],
  from: number,
  isTerm: (t: string) => boolean,
): { body: string[]; termIdx: number } {
  let i = from;
  const body: string[] = [];
  while (i < lines.length && !isTerm(lines[i]!.trim())) {
    body.push(lines[i]!);
    i++;
  }
  return { body, termIdx: i };
}

function parseDirective(
  lines: string[],
  startI: number,
  defaults: ScenarioDefaults | undefined,
  diagnostics: Diagnostic[],
): DirectiveResult {
  const openLine = lines[startI]!;
  const l = loc(startI + 1, 1, openLine.length + 1);
  const nameMatch = /^:::\s*([A-Za-z][\w-]*)/.exec(openLine.trim());
  const name = nameMatch?.[1];

  const mkError = (endIdx: number, message: string): DirectiveResult => {
    const raw = lines.slice(startI, endIdx).join('\n');
    const d = diag('malformed-directive', 'error', message, l);
    diagnostics.push(d);
    return { node: { kind: 'error', raw, diagnostic: d, loc: l }, nextIdx: endIdx };
  };

  if (name !== 'playground' && name !== 'goal') {
    return mkError(
      startI + 1,
      "This ::: line isn't a directive we understand — use :::playground or :::goal.",
    );
  }

  const open = directiveConfig(openLine);
  if (open.malformed) {
    return mkError(startI + 1, `The ${name} settings are missing a closing } brace.`);
  }
  if (open.exec) {
    diagnostics.push(
      diag(
        'executable-content',
        'error',
        `The ${name} settings contain an executable form. Playground/goal settings must be plain values.`,
        l,
      ),
    );
  }

  if (name === 'goal') {
    const c = collectUntil(lines, startI + 1, (t) => t === ':::');
    if (c.termIdx >= lines.length) {
      return mkError(lines.length, 'This :::goal directive was never closed with a matching :::.');
    }
    const prose = c.body.join('\n').trim();
    const goal = buildGoal(open.config, prose, startI + 1);
    const node: GoalNode = { kind: 'goal', goal, prose: prose || undefined, loc: l };
    return { node, nextIdx: c.termIdx + 1 };
  }

  // name === 'playground'
  const c1 = collectUntil(
    lines,
    startI + 1,
    (t) => t === ':::' || t.startsWith(':::goal'),
  );
  if (c1.termIdx >= lines.length) {
    return mkError(
      lines.length,
      'This :::playground directive was never closed with a matching :::.',
    );
  }
  const playProse = c1.body.join('\n').trim();
  const config = buildPlaygroundConfig(open.config, defaults);
  let goal: Goal | undefined;
  let endIdx: number;

  const termLine = lines[c1.termIdx]!.trim();
  if (termLine === ':::') {
    endIdx = c1.termIdx + 1;
  } else {
    // embedded :::goal
    const goalHeaderIdx = c1.termIdx;
    const gc = directiveConfig(lines[goalHeaderIdx]!);
    if (gc.malformed) {
      return mkError(goalHeaderIdx + 1, 'The embedded goal settings are missing a closing } brace.');
    }
    if (gc.exec) {
      diagnostics.push(
        diag(
          'executable-content',
          'error',
          'The embedded goal settings contain an executable form. Goal settings must be plain values.',
          loc(goalHeaderIdx + 1, 1, lines[goalHeaderIdx]!.length + 1),
        ),
      );
    }
    const c2 = collectUntil(lines, goalHeaderIdx + 1, (t) => t === ':::');
    if (c2.termIdx >= lines.length) {
      return mkError(lines.length, 'This embedded :::goal was never closed with a matching :::.');
    }
    const gProse = c2.body.join('\n').trim();
    goal = buildGoal(gc.config, gProse, goalHeaderIdx + 1);
    endIdx = c2.termIdx + 1;
  }

  const fullConfig: PlaygroundConfig = goal ? { ...config, goal } : config;
  const node: PlaygroundNode = {
    kind: 'playground',
    config: fullConfig,
    prose: playProse || undefined,
    goal,
    loc: l,
  };
  return { node, nextIdx: endIdx };
}

function buildPlaygroundConfig(
  obj: Record<string, PValue>,
  defaults: ScenarioDefaults | undefined,
): PlaygroundConfig {
  const scenario =
    obj.scenario !== undefined ? String(obj.scenario) : defaults?.scenario ?? '';
  const seed = obj.seed !== undefined ? Number(obj.seed) : defaults?.seed ?? 0;
  const starterId = obj.starter !== undefined ? String(obj.starter) : defaults?.starter;
  const subsetName = obj.subset !== undefined ? String(obj.subset) : defaults?.subset;
  const starter: GenomeSource = { kind: 'ref', id: starterId ?? '' };
  const subset: ActiveSubset =
    subsetName !== undefined && subsetName !== ''
      ? { kind: 'subset', name: subsetName, verbs: [] }
      : { kind: 'classic32' };
  return { scenario, seed, starter, subset };
}

const GOAL_PARAM_KEYS = ['within', 'count', 'population', 'size', 'cycles', 'by'] as const;

function buildGoal(obj: Record<string, PValue>, prose: string, line: number): Goal {
  const kind =
    typeof obj.kind === 'string'
      ? obj.kind
      : obj.kind !== undefined
        ? String(obj.kind)
        : '';
  const params: Record<string, number> = {};
  for (const k of GOAL_PARAM_KEYS) {
    if (obj[k] !== undefined) params[k] = Number(obj[k]);
  }
  return {
    id: `goal-l${line}`,
    kind: kind as GoalKind,
    params,
    tier: 'required',
    title: prose,
  };
}

// ===========================================================================
// validate — schema + binding checks (existence via the caller's IdResolver)
// ===========================================================================
const GOAL_KINDS = new Set<string>([
  'replicates',
  'reach-pop',
  'shrink-genome',
  'survive',
  'out-populate',
  'diversity',
]);
const REQUIRED_FRONTMATTER = ['id', 'chapter', 'title', 'unlocks', 'requires', 'mutation'] as const;

export function validate(ast: LessonAst, resolver: IdResolver): Diagnostic[] {
  const out: Diagnostic[] = [];
  const fmLoc = loc(1, 1, 1);
  const fm = ast.frontmatter;

  if (fm) {
    for (const field of REQUIRED_FRONTMATTER) {
      if ((fm as Record<string, unknown>)[field] === undefined) {
        out.push(
          diag(
            'missing-field',
            'error',
            `The frontmatter is missing "${field}". Every lesson needs a "${field}".`,
            fmLoc,
          ),
        );
      }
    }
    if (fm.mutation !== undefined && fm.mutation !== 'on' && fm.mutation !== 'off') {
      out.push(
        diag(
          'bad-enum',
          'error',
          `mutation must be exactly "on" or "off", not "${fm.mutation}".`,
          fmLoc,
        ),
      );
    }
    if (fm.unlocks && Array.isArray(fm.unlocks.verbs)) {
      for (const v of fm.unlocks.verbs) {
        if (!resolver.isVerb(v)) {
          out.push(
            diag(
              'unknown-verb',
              'error',
              `"${v}" in unlocks.verbs isn't one of the classic-32 instructions — check the spelling.`,
              fmLoc,
            ),
          );
        }
      }
    }
    if (Array.isArray(fm.requires)) {
      for (const r of fm.requires) {
        if (!resolver.hasLesson(r)) {
          out.push(
            diag(
              'unknown-prereq',
              'error',
              `This lesson requires "${r}", but no lesson has that id — check the spelling in requires.`,
              fmLoc,
            ),
          );
        }
      }
    }
  }

  for (const node of ast.body) {
    if (node.kind === 'playground') {
      const cfg = node.config;
      if (
        typeof cfg.scenario === 'string' &&
        cfg.scenario !== '' &&
        !resolver.hasScenario(cfg.scenario)
      ) {
        out.push(
          diag(
            'unknown-scenario',
            'error',
            `The playground names scenario "${cfg.scenario}", but there's no scenario with that id.`,
            node.loc,
          ),
        );
      }
      const starter = cfg.starter;
      if (starter && starter.kind === 'ref' && starter.id !== '') {
        if (!resolver.hasStarter(starter.id)) {
          out.push(
            diag(
              'unknown-starter',
              'error',
              `The playground's starter genome "${starter.id}" wasn't found.`,
              node.loc,
            ),
          );
        }
      }
      const subset = cfg.subset;
      if (subset && subset.kind === 'subset' && subset.name) {
        if (!resolver.hasSubset(subset.name)) {
          out.push(
            diag(
              'unknown-subset',
              'error',
              `The playground's instruction set "${subset.name}" isn't a known subset.`,
              node.loc,
            ),
          );
        }
      }
      if (node.goal) validateGoal(node.goal, node.loc, out);
    } else if (node.kind === 'goal') {
      validateGoal(node.goal, node.loc, out);
    } else if (node.kind === 'prose') {
      for (const ref of node.refs) {
        if (ref.kind === 'code') {
          if (!resolver.isVerb(ref.verb)) {
            out.push(
              diag(
                'unknown-verb',
                'error',
                `\`${ref.verb}\` looks like an instruction link, but it isn't one of the classic-32 verbs.`,
                ref.loc,
              ),
            );
          }
        } else {
          if (!resolver.hasKeyword(ref.term)) {
            out.push(
              diag(
                'unknown-term-hint',
                'hint',
                `"${ref.term}" isn't in the keyword registry yet, so it won't get a tooltip — you can still keep it.`,
                ref.loc,
              ),
            );
          }
        }
      }
    }
    // ErrorNode carries its own parse diagnostic; validate doesn't duplicate it.
  }

  return out;
}

function validateGoal(goal: Goal, at: Loc, out: Diagnostic[]): void {
  if (!goal.kind || !GOAL_KINDS.has(goal.kind)) {
    out.push(
      diag(
        'invalid-goal',
        'error',
        `The goal kind "${goal.kind}" isn't one we know. Try one of: replicates, reach-pop, shrink-genome, survive, out-populate, diversity.`,
        at,
      ),
    );
    return; // unknown kind: per-kind param rules don't apply until the kind is fixed
  }
  // Kind is known → validate the params-per-kind (missing kind-required param, non-integer/<=0
  // deadline, …) via the goal package's rules. No ctx: the soft cross-layer mutation check is a
  // GOAL-layer concern, not a content authoring error.
  for (const d of validateGoalParams(goal)) {
    out.push(diag('invalid-goal', 'error', d.message, at));
  }
}
