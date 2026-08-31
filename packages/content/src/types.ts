// ============================================================================
// @tierra26/content — SHARED FOUNDATION (single source of every cross-system
// data shape). Locked BEFORE the per-system fleet so CONTENT/PLAY/INSTRPAGE/
// KEYWORD/PROGRESS/GOAL agree on one PlaygroundConfig, one Goal, one KeywordEntry,
// one Lesson AST, etc. — the type-drift the spec validation (S17/S19/S20-class)
// warned about. Modules import their DATA shapes from here and add only behavior.
//
// Deriving layers (single-source, C-CON-SOURCE):
//   - engine  (@tierra26/engine):     Scenario, RunDescriptor, ObservationFrame, …
//   - genescript (@tierra26/genescript): Diagnostic (compile), VerbEntry/VOCAB, …
// Rendering is the UI layer's job; everything here is pure data + logic contracts.
// NOTE: `--experimental-strip-types` rejects TS parameter properties — declare
// class fields explicitly (no `constructor(private x)`).
// ============================================================================

// ---- Re-exported engine contracts (the reproducibility bridge) -------------
export type {
  Scenario,
  SubsetSpec,
  MalMode,
  RunDescriptor,
  Injection,
  LiveStats,
  Snapshot,
} from '../../engine/src/index.ts';
export type {
  ObservationFrame,
  TankView,
  RunDigest,
  HistBin,
  Histograms,
  FounderCensus,
} from '../../engine/src/stats.ts';
export type { InstructionSet } from '../../engine/src/runtime.ts';

// ---- Re-exported genescript contracts --------------------------------------
// GeneScript compile diagnostics (kid-friendly, C-GS-KID). Distinct from the
// CONTENT authoring Diagnostic below; PLAY.injectEdited surfaces THESE.
export type { Diagnostic as GsDiagnostic } from '../../genescript/src/types.ts';
export type { VerbEntry } from '../../genescript/src/vocab.ts';

// The five VOCAB color roles, verbatim (a verb entry reuses its VOCAB category).
export type VocabCategory = 'action' | 'register' | 'marker' | 'control' | 'value';

// ============================================================================
// SHARED: Genome source + active subset (used by PLAY, INSTRPAGE, CONTENT, GOAL)
// ============================================================================

// Where a starter/solution/variant genome comes from.
export type GenomeSource =
  | { kind: 'genescript'; source: string } // inline GeneScript text (compiled under the subset)
  | { kind: 'ref'; id: string };           // named genome, resolved by [01]/[03]

// Which engine instructions a playground enables. classic-32, or a named subset
// of GeneScript verbs (nop0/nop1 always implied — engine [15] §4.4).
export type ActiveSubset =
  | { kind: 'classic32' }
  | { kind: 'subset'; name?: string; verbs: readonly string[] };

// ============================================================================
// [06] GOAL — the declarative goal model (authored) + checker I/O
// Owner: src/goal.ts. Referenced by PlaygroundConfig, CONTENT :::goal, INSTRPAGE.
// ============================================================================

export type Int = number; // integer (C-INT-aligned; goal params & measured values are integers)

export type GoalKind =
  | 'replicates'    // creature produces >= count daughters within `within` cycles (births)
  | 'reach-pop'     // live population reaches >= population at/before cycle `within`
  | 'shrink-genome' // a live descendant genome size drops below `size` bytes
  | 'survive'       // the lineage stays alive (population > 0) for >= `cycles` cycles
  | 'out-populate'  // by cycle `by`, this genome's live pop > the rival's (Versus)
  | 'diversity';    // distinct live genotypes reaches >= count by cycle `within`

export interface GoalParams {
  within?: Int;     // cycle budget / deadline (replicates, reach-pop, diversity)
  count?: Int;      // #daughters (replicates) or #genotypes (diversity); default 1
  population?: Int; // target live population (reach-pop)
  size?: Int;       // genome-size threshold in bytes, exclusive (shrink-genome)
  cycles?: Int;     // survival horizon (survive)
  by?: Int;         // decision cycle for a Versus comparison (out-populate)
}

export type GoalTier = 'required' | 'bonus'; // required drives completion; bonus never blocks

// A goal as authored in a lesson/playground (00 §3 `:::goal { kind, … }`).
export interface Goal {
  id: string;
  kind: GoalKind;
  params: GoalParams;
  tier: GoalTier;    // default 'required'
  title: string;     // kid-facing one-liner
  cycles?: Int;      // optional per-goal run budget override (else the playground's)
}

// PlaygroundConfig.goal is an authored Goal (alias kept for the [02] spec's name).
export type GoalSpec = Goal;

// A kid-friendly teaching hint attached to a FAILED goal (never scolds — 06 §4).
export interface GoalHint {
  code: string;             // stable, e.g. 'never-divided' | 'too-big' | 'died-early'
  message: string;          // plain language, ages 8-16 (C-CON-KID) — teaches
  suggestion?: string;      // the smallest concrete next step
  hoverTerms?: string[];    // technical words → resolvable to KEYWORD [04] tooltips
  teaches: true;            // always true (06 §4 rule 2)
}

export interface GoalResult {
  goalId: string;
  kind: GoalKind;
  passed: boolean;
  measured: Int;            // observed value the predicate compared
  atCycle: Int;            // cycle the verdict was decided at
  hint?: GoalHint;         // present iff !passed
}

// Live, queryable goal status for a running playground (PLAY.state.goal).
export interface GoalStatus {
  goalId: string;
  kind: GoalKind;
  passed: boolean;
  measured: Int;
  atCycle: Int;
  progress?: number;       // presentation-only 0..1 hint; never affects the verdict
}

// ============================================================================
// [02] PLAY — the authored playground config + engine bridge
// Owner: src/play.ts. The shareable, reproducible recipe.
// ============================================================================

export type PanelId = 'soup' | 'registers' | 'stack' | 'code' | 'stats' | 'goal' | 'tank';
export type SpeedLevel = 'step' | 'slow' | 'normal' | 'fast' | 'max';

export interface SpotlightSpec {
  instruction?: string; // highlight a specific verb/instruction (INSTRPAGE [03])
  line?: number;        // highlight a starter source line (via the source map)
}

// Purely presentational; the UI MAY honor these; they NEVER affect the run.
export interface DisplayOptions {
  panels?: readonly PanelId[];
  speedDefault?: SpeedLevel;
  spotlight?: SpotlightSpec;
}

export interface PlaygroundVariant {
  readonly id: string;         // stable id (share links + selection)
  readonly label: string;      // kid-facing name (C-CON-KID)
  readonly starter: GenomeSource;
}

// The authored config (serializable data; the shareable recipe).
export interface PlaygroundConfig {
  readonly scenario: string | Partial<import('../../engine/src/index.ts').Scenario>;
  readonly seed: number;                    // uint32 PRNG seed (C-CON-DET)
  readonly starter: GenomeSource;           // initial creature, authored in GeneScript
  readonly subset: ActiveSubset;            // active instruction subset (C-CON-SUBSET)
  readonly goal?: GoalSpec;                 // optional embedded goal [06]
  readonly variants?: readonly PlaygroundVariant[]; // "try this" alternatives
  readonly cycles?: number;                 // default run budget (goal checking / runTo)
  readonly display?: DisplayOptions;        // presentational only (never in RunDescriptor)
}

// line ↔ byte-range mapping the "peek under the hood" view renders (GSINV-SOURCEMAP).
export interface SourceMapEntry { readonly line: number; readonly byteStart: number; readonly byteEnd: number; }
export interface SourceMappedGenome {
  readonly source: string;      // GeneScript text (authored or disassembled)
  readonly bytes: Uint8Array;   // compiled opcode bytes loaded into the engine
  readonly map: readonly SourceMapEntry[];
}

// Result of a learner injecting edited code.
export type InjectResult =
  | { ok: true; creatureId: number; genome: SourceMappedGenome }
  | { ok: false; diagnostics: readonly import('../../genescript/src/types.ts').Diagnostic[] };

// A normalized playground: refs resolved, subset resolved to an engine set, starter
// compiled + verified to load (C-CON-COMPILES). The bridge to a RunDescriptor.
export interface NormalizedPlayground {
  readonly config: PlaygroundConfig;
  readonly scenario: import('../../engine/src/index.ts').Scenario;
  readonly subset: import('../../engine/src/runtime.ts').InstructionSet;
  readonly starter: SourceMappedGenome;
  readonly goal?: Goal;
  readonly display: DisplayOptions;
}

// ============================================================================
// [04] KEYWORD — the color-coded, hoverable term registry
// Owner: src/keyword.ts. Verb entries DERIVE from VOCAB; concept nouns defined here.
// ============================================================================

// VOCAB's five color roles + one concept role for nouns (soup, daughter, …).
export type KeywordCategory = VocabCategory | 'concept';

export interface KeywordTooltip {
  kid: string;   // one plain sentence, ages 8-16, no jargon (C-CON-KID)
  more: string;  // the "more" line: verb → VOCAB machine truth; noun → deeper truth
}

export type KeywordLink =
  | { kind: 'instruction'; mnemonic: string } // → per-instruction page [03]
  | { kind: 'concept'; slug: string };         // → a concept explainer page

export interface KeywordEntry {
  term: string;                 // canonical display term, lower-case (unique in the registry)
  aliases?: readonly string[];  // other surface forms that resolve here (plural, synonym)
  kind: 'verb' | 'concept';     // verb = mirrors a VOCAB verb; concept = a noun defined here
  category: KeywordCategory;    // exactly one color role
  tooltip: KeywordTooltip;
  mnemonic?: string;            // verb only: the VOCAB mnemonic mirrored (join key)
  link?: KeywordLink;           // optional "read more" target
}

// A resolved span the UI should color (pure data; the module does NOT render).
export interface KeywordSpan { start: number; end: number; term: string; category: KeywordCategory; }

// ============================================================================
// [03] INSTRPAGE — one data record per classic-32 verb (instruction DEPTH)
// Owner: src/instrpage.ts. Identity fields PROJECT VOCAB (never redefine).
// ============================================================================

export interface AnimationSpec {
  summary: string; // one plain line (C-CON-KID)
  targets: readonly (
    | { kind: 'register'; reg: 'A' | 'B' | 'C' | 'D'; change: 'increase' | 'decrease' | 'set' | 'read' }
    | { kind: 'flag'; flag: 'E' | 'S' | 'Z'; change: 'set' | 'clear' }
    | { kind: 'stack'; change: 'push' | 'pop' }
    | { kind: 'soup'; from: 'self' | 'mother' | 'daughter'; to: 'self' | 'mother' | 'daughter' }
    | { kind: 'ip'; change: 'jump' | 'skip' | 'call' | 'return' }
    | { kind: 'cell'; change: 'allocate' | 'divide' }
  )[];
}

export interface EditableScenario {
  id: string;              // unique within the page
  prompt: string;          // "try: change X" — one plain instruction (C-CON-KID)
  config: PlaygroundConfig; // the reproducible engine recipe [02]
  spotlight: string;       // which verb this scenario highlights (== the page verb)
}

export interface InstructionPage {
  verb: string;            // the GeneScript verb — join key to VOCAB (unique)
  // identity: DERIVED from VOCAB, not redefined (C-CON-SOURCE)
  mnemonic: string;        // === vocab(verb).mnemonic (via engine ISA, not hard-coded)
  kid: string;             // === vocab(verb).kid
  machine: string;         // === vocab(verb).machine
  // depth: OWNED here
  animation: AnimationSpec;
  scenarios: readonly EditableScenario[]; // >= 1
  seeAlso: readonly string[];             // related verbs — each a real verb in this table
  commonMistakes: readonly string[];      // plain-language pitfalls (C-CON-KID)
  introLesson: string;                    // lesson id that introduces this verb — resolves in [05]
}

// ============================================================================
// [05] PROGRESS — curriculum graph + unlocks
// Owner: src/progress.ts.
// ============================================================================

export type LessonId = string;
export type ChapterId = number;
export type Verb = string;      // a GeneScript verb / classic-32 mnemonic NAME (not an opcode byte)
export type Concept = string;   // a taught idea: 'daughter', 'copy-loop', 'selection', 'parasite'
export type Phase = 'design' | 'life' | 'emergence' | 'versus';

export interface Unlocks {
  verbs: readonly Verb[];
  concepts: readonly Concept[];
}

export interface Lesson {
  id: LessonId;
  chapter: ChapterId;
  title: string;
  requires: readonly LessonId[]; // prerequisite lessons (edges INTO this node)
  unlocks: Unlocks;              // what this lesson adds to the cumulative set
  mutation: 'off' | 'on';        // engine mutation setting this lesson runs under
  uses: { verbs: readonly Verb[]; concepts: readonly Concept[] }; // what the playground/goal references
}

export interface Chapter {
  id: ChapterId;
  title: string;
  phase: Phase;
  lessons: readonly LessonId[]; // in-chapter order
}

export interface Curriculum {
  chapters: readonly Chapter[];
  lessons: Readonly<Record<LessonId, Lesson>>;
}

export interface LearnerState {
  completed: ReadonlySet<LessonId>; // the ONLY input that varies availability
  sandbox?: boolean;                // free-play: everything unlocked
}

export interface Unlocked {
  verbs: ReadonlySet<Verb>;
  concepts: ReadonlySet<Concept>;
  subset: readonly Verb[];           // the ACTIVE INSTRUCTION SUBSET (sorted; = union of verbs)
  available: ReadonlySet<LessonId>;  // lessons whose requires[] ⊆ completed
}

// ============================================================================
// [01] CONTENT — lesson source → Lesson AST + validation
// Owner: src/content.ts.
// ============================================================================

// CONTENT authoring diagnostics (distinct from GsDiagnostic). Loc uses startCol/endCol.
export interface Loc { line: number; startCol: number; endCol: number; }
export type Severity = 'error' | 'warning' | 'hint';
export type DiagCode =
  | 'missing-field'
  | 'bad-enum'
  | 'frontmatter-required'
  | 'malformed-directive'
  | 'executable-content'
  | 'unknown-scenario'
  | 'unknown-starter'
  | 'unknown-verb'
  | 'unknown-prereq'
  | 'unknown-subset'
  | 'unknown-keyword'
  | 'unknown-term-hint'
  | 'invalid-goal'
  | (string & {}); // extensible; keep known codes stable

export interface Diagnostic {
  code: DiagCode;
  severity: Severity;
  message: string;  // plain-language, author/kid tone (C-CON-KID)
  loc: Loc;         // pinpoints the field/span
}

export interface ScenarioDefaults {
  scenario?: string;
  seed?: number;
  starter?: string;
  subset?: string;
}

export interface Frontmatter {
  id: string;
  chapter: number;
  title: string;
  unlocks: { verbs: string[]; concepts: string[] };
  requires: string[];
  mutation: 'on' | 'off';
  defaults?: ScenarioDefaults;
}

export interface KeywordRef { kind: 'keyword'; term: string; loc: Loc; } // from {term}
export interface CodeRef { kind: 'code'; verb: string; loc: Loc; }       // from `verb`
export type InlineRef = KeywordRef | CodeRef;

export interface ProseNode {
  kind: 'prose';
  markdown: string;         // raw prose span (renderer parses markdown)
  refs: InlineRef[];        // ordered inline references extracted from this span
  loc: Loc;
}
export interface PlaygroundNode {
  kind: 'playground';
  config: PlaygroundConfig; // shape only; [02] interprets/validates semantics
  prose?: string;           // inner learner-facing prose
  goal?: Goal;              // an embedded :::goal nested into this playground
  loc: Loc;
}
export interface GoalNode {
  kind: 'goal';
  goal: Goal;               // shape only; [06] interprets/validates semantics
  prose?: string;
  loc: Loc;
}
export interface ErrorNode {
  kind: 'error';
  raw: string;              // the source that could not be parsed
  diagnostic: Diagnostic;
  loc: Loc;
}

export type BodyNode = ProseNode | PlaygroundNode | GoalNode | ErrorNode;

export interface LessonAst {
  frontmatter: Frontmatter | null;
  body: BodyNode[]; // ordered; source order
}

export interface ParseResult {
  frontmatter: Frontmatter | null;
  ast: LessonAst;
  diagnostics: Diagnostic[];
}

// Existence checks validate() consults — the parser holds NO id lists (C-CON-SOURCE).
export interface IdResolver {
  hasScenario(id: string): boolean;
  hasStarter(id: string): boolean;
  isVerb(verb: string): boolean;   // a real classic-32 verb
  hasLesson(id: string): boolean;  // a known prerequisite lesson
  hasKeyword(term: string): boolean;
  hasSubset(name: string): boolean;
}

// ---- small shared helpers --------------------------------------------------
export function hasErrors(ds: readonly { severity: Severity }[]): boolean {
  return ds.some((d) => d.severity === 'error');
}
