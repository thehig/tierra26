// Content Model & Authoring (CONTENT) — Lesson schema, frontmatter, typed directives, parse → Lesson AST, validation.
// Spec: docs/spec/content/01-content-model-and-authoring.md (§8 acceptance criteria).
// Ref: content/00-overview.md §1 (teaching model) / §2 (pipeline) / §3 (concrete lesson format) / §5 (contracts) / §6 (CONTINV);
//      SPEC.md §11 (content-as-data, embeddable playgrounds). Payload MEANING is downstream: [02] PLAY, [04] KEYWORD, [05] PROGRESS, [06] GOAL.
//
// Pending until the content parser/validator exists; encoded as node:test todo tests (spec-as-checklist).
// When parse()/validate() land, replace `it.todo(name)` with `it(name, () => { ... })`.
// Do NOT import content src/ modules yet — they don't exist and an import error would fail the file.
//
// FIXME (C-CON-DATA, CONTENT-020): a lesson is DECLARATIVE data — the grammar admits only prose/directives/references.
//   Any executable form (a <script>/JS/handler or a non-declarative frontmatter value) must be REJECTED; assert the error.
// FIXME (C-CON-SOURCE, CONTENT-008/009/012-015): parse() records REFERENCES (term/verb/scenario/starter/prereq strings) and
//   resolves nothing. Existence is validate()'s job via a caller-supplied IdResolver — the parser holds no id lists.
// FIXME (error tolerance, CONTENT-016): parse() must NEVER throw. A malformed directive/frontmatter becomes an ErrorNode
//   carrying a Diagnostic; assert the tree is still returned and later blocks parse independently.
// FIXME (C-CON-DET, CONTENT-019): parse() is a pure function of source text — no RNG, no wall-clock, no Map-key-order.
//   Assert twice-parsed source yields structurally identical AST + diagnostics in source order.
import { describe, it } from 'node:test';

describe('Content Model & Authoring (CONTENT)', () => {
  it.todo('[CONTENT-001] Valid frontmatter parses: id, chapter, title, unlocks {verbs, concepts}, requires[], mutation parse to a correctly-typed Frontmatter record (and validate clean)');
  it.todo('[CONTENT-002] Missing a required frontmatter field (id/chapter/title/unlocks/requires/mutation) → an error diagnostic naming the field; parse still returns a best-effort result');
  it.todo('[CONTENT-003] mutation is a closed enum: on/off parse; any other value is an error diagnostic (design→emergence toggle is not free-form)');
  it.todo('[CONTENT-004] Scenario defaults parse: optional defaults { scenario, seed, starter, subset } → ScenarioDefaults, and a playground omitting a field inherits it rather than erroring');
  it.todo('[CONTENT-005] A :::playground directive parses into a PlaygroundNode carrying its config (scenario, seed, starter, subset) as shape-only data plus its inner prose');
  it.todo('[CONTENT-006] A :::goal directive parses into a GoalNode carrying its spec (e.g. { kind: replicates, within: 20000 }) as shape-only data plus its learner-facing prose');
  it.todo('[CONTENT-007] An embedded :::goal after a :::playground nests into that playground block (a playground with its goal), per the concrete lesson format');
  it.todo('[CONTENT-008] {term} becomes a KeywordRef: an inline {daughter} span is extracted into ProseNode.refs as KeywordRef{ term: "daughter" } with a Loc — the term string only, no color/tooltip resolved (C-CON-SOURCE)');
  it.todo('[CONTENT-009] `verb` becomes an instruction link (CodeRef): a backtick span whose content is a known verb (`copy-byte`) becomes a CodeRef{ verb }; a non-verb backtick span stays ordinary inline code (no CodeRef)');
  it.todo('[CONTENT-010] Prose is retained verbatim + refs ordered: a ProseNode keeps its raw markdown and lists its inline KeywordRef/CodeRefs in source order with correct Locs');
  it.todo('[CONTENT-011] Body order is preserved: body is the ordered list of prose/playground/goal nodes in source (reading) order — a playground keeps its position relative to the prose that motivates it');
  it.todo('[CONTENT-012] A lesson referencing an unknown scenario id fails validation: a :::playground whose scenario is not in the IdResolver yields a validate error (unknown scenario id)');
  it.todo('[CONTENT-013] An unknown starter-genome id fails validation: a :::playground whose starter is not resolvable yields a validate error');
  it.todo('[CONTENT-014] An unknown verb fails validation: an unlocks.verbs entry or a `verb` CodeRef that is not a classic-32 verb yields a validate error');
  it.todo('[CONTENT-015] An unknown prerequisite id fails validation: a requires[] id with no matching lesson yields a validate error (unknown prerequisite)');
  it.todo('[CONTENT-016] A malformed directive → diagnostic-bearing ErrorNode, no crash: an unterminated/mis-braced ::: directive becomes one ErrorNode with a Diagnostic; later blocks parse independently and parse never throws');
  it.todo('[CONTENT-017] Diagnostics are precise and kid/author-tone (C-CON-KID): every diagnostic carries a stable code, a plain-language message, and a Loc pinpointing the field/span');
  it.todo('[CONTENT-018] Auto-highlight ergonomics: an unmarked known term is left in raw markdown for [04] to auto-link, an explicit {term} forces a KeywordRef, and an explicit {term} not in the registry produces a hint (not an error)');
  it.todo('[CONTENT-019] Parse is deterministic (C-CON-DET): parsing the same source twice yields structurally identical ASTs and diagnostics in the same source order; no RNG, clock, or key-order dependence');
  it.todo('[CONTENT-020] Content carries no executable code (C-CON-DATA): the grammar admits only prose/directives/references, and an injected executable form (<script>/JS/handler or non-declarative frontmatter value) is rejected with an error');
  it.todo('[CONTENT-021] A well-formed lesson round-trips to a resolvable content record: with all ids resolvable (scenario, starter, verbs, subset, prereqs) validate returns zero error diagnostics — a fully-resolved record for [02]/[04]/[05]/[06] (CONTINV-VALID)');
  it.todo('[CONTENT-022] Absent/empty frontmatter is handled: no frontmatter fence → frontmatter: null + a diagnostic while still parsing the body; empty source → empty body + "frontmatter required" diagnostic, never a throw');
});
