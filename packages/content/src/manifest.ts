// ============================================================================
// DOCLANG MANIFEST — the component vocabulary, as data.
//
// The parser (doclang.ts) is generic: it knows tags, attributes and nesting,
// but nothing about what any tag MEANS. This table is what makes a document
// machine-readable — every check the validator performs is driven from here,
// and the app's renderer registry is asserted to have exactly these keys.
//
// Adding a component = one row here + one registry entry. Nothing else.
//
// LEAF MODULE: types only. Do not add value imports (see the doclang.ts header
// for why the build-time config graph must stay tiny).
// ============================================================================

export type AttrType =
  | 'string'
  | 'int'
  | 'bool'
  | 'enum'
  | 'string[]'
  | 'opcode' // must be a real engine mnemonic (or its bound display name)
  | 'register' // A | B | C | D
  | 'flag' // E | S | Z
  | 'concept'; // must resolve to a concept page / keyword entry

export interface AttrSpec {
  type: AttrType;
  values?: readonly string[]; // enum members
  required?: boolean;
  default?: string | number | boolean;
  doc: string;
}

/** What may appear between the open and close tag.
 *  - 'none'    — any content is an error
 *  - 'raw'     — verbatim dedented text (genome source; never markdown-parsed)
 *  - 'prose'   — markdown only, no child tags
 *  - string[]  — markdown PLUS the listed child tags */
export type ChildRule = 'none' | 'raw' | 'prose' | readonly string[];

export interface TagSpec {
  name: string; // canonical PascalCase
  attrs: Readonly<Record<string, AttrSpec>>;
  children: ChildRule;
  parents?: readonly string[]; // if set, the tag is only legal inside these
  /** Inline tags live inside a sentence and are scanned out of prose;
   *  block tags own a whole line and may contain children. */
  inline?: boolean;
  /** At least one of these attribute groups must be satisfied (a one-of choice). */
  oneOf?: readonly (readonly string[])[];
  doc: string;
}

// The 9 spotlight targets EntityDiagram understands (its `Focus` union).
export const FOCUS_VALUES = [
  'whole',
  'world',
  'genome',
  'registers',
  'ip',
  'flags',
  'age',
  'daughter',
  'run',
] as const;

// ---------------------------------------------------------------------------
// Goal kinds and the parameters each one requires.
// The first six mirror app/src/learn/chapters.ts `MicroGoal` (single-creature
// teaching goals); the rest mirror types.ts `GoalKind` (soup-scale goals).
// ---------------------------------------------------------------------------
export const GOAL_PARAMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  regAtLeast: ['reg', 'value'],
  regEquals: ['reg', 'value'],
  sizeEquals: ['value'],
  daughter: [],
  daughterFill: ['pct'],
  born: [],
  replicates: [],
  'reach-pop': ['population'],
  'shrink-genome': ['size'],
  survive: ['cycles'],
  'out-populate': ['by'],
  diversity: [],
});
export const GOAL_KINDS: readonly string[] = Object.freeze(Object.keys(GOAL_PARAMS));

const t = (type: AttrType, doc: string, extra: Partial<AttrSpec> = {}): AttrSpec => ({
  type,
  doc,
  ...extra,
});

export const MANIFEST: Readonly<Record<string, TagSpec>> = Object.freeze({
  // -- the God Design: one chip for every token the language can name ---------
  Chip: {
    name: 'Chip',
    doc: 'The canonical token chip. Renders an opcode/register/flag/concept with its bound emoji, colour and name, in whichever language mode is active.',
    attrs: {
      opcode: t('opcode', 'An engine mnemonic (incA) or its bound display name (grow-a).'),
      register: t('register', 'A, B, C or D.', { values: ['A', 'B', 'C', 'D'] }),
      flag: t('flag', 'E, S or Z.', { values: ['E', 'S', 'Z'] }),
      concept: t('concept', 'A concept slug with a Bible page (soup, daughter, ...).'),
    },
    oneOf: [['opcode'], ['register'], ['flag'], ['concept']],
    inline: true,
    children: 'raw', // optional label/target text: <Chip opcode="jmpb">top</Chip>
  },

  // -- scrollytelling ---------------------------------------------------------
  Scrolly: {
    name: 'Scrolly',
    doc: 'A sticky visual stage beside a column of scroll waypoints.',
    attrs: {},
    children: ['Stage', 'Waypoint'],
  },
  Stage: {
    name: 'Stage',
    doc: 'The sticky column of a Scrolly. Holds one visual component.',
    attrs: {
      sticky: t('bool', 'Stick to the viewport while the waypoints scroll.', { default: true }),
    },
    children: ['EntityDesigner', 'Simulation'],
    parents: ['Scrolly'],
  },
  Waypoint: {
    name: 'Waypoint',
    doc: 'One scroll step. When it centres in the viewport its events drive the stage.',
    attrs: {
      focus: t('enum', 'Which part of the stage to spotlight.', { values: FOCUS_VALUES }),
      at: t('int', 'Step the stage demo to this tick when the waypoint centres.'),
    },
    children: 'prose',
    parents: ['Scrolly'],
  },

  // -- the instancable creature stage ----------------------------------------
  EntityDesigner: {
    name: 'EntityDesigner',
    doc: 'A creature in its world: genome, registers, flags, save-pile, reading head. Read-only by default; `editable` adds the code editor, a Goal child adds live checking.',
    attrs: {
      soup: t('int', 'World size in cells.', { default: 36 }),
      emoji: t('enum', 'Show each cell opcode emoji in the world grid.', {
        values: ['on', 'off', 'auto'],
        default: 'auto',
      }),
      loupe: t('enum', 'Enable the hover magnifier over the world grid.', {
        values: ['on', 'off', 'auto'],
        default: 'auto',
      }),
      mode: t('enum', 'Force a language mode instead of following the global toggle.', {
        values: ['simple', 'advanced', 'follow'],
        default: 'follow',
      }),
      editable: t('bool', 'Show the gene editor beside the diagram.', { default: false }),
      snapshot: t('string', 'Resume from a captured world in docs/snapshots/.'),
    },
    children: ['Genome', 'State', 'Goal'],
  },
  Genome: {
    name: 'Genome',
    doc: 'The creature code, written in real mnemonics. Use `ref` for a named genome instead of inline text.',
    attrs: { ref: t('string', 'A named starter genome id (e.g. ancestor).') },
    children: 'raw',
    parents: ['EntityDesigner'],
  },
  State: {
    name: 'State',
    doc: 'Seed the starting CPU state: registers, flags, save-pile and reading head.',
    attrs: {
      a: t('int', 'Register A.'),
      b: t('int', 'Register B.'),
      c: t('int', 'Register C.'),
      d: t('int', 'Register D.'),
      flags: t('string[]', 'Flags to raise, e.g. "[E, Z]".'),
      stack: t('string[]', 'Save-pile contents, bottom first.'),
      ip: t('int', 'Reading-head offset from the creature start.'),
    },
    children: 'none',
    parents: ['EntityDesigner'],
  },

  // -- challenges -------------------------------------------------------------
  Challenge: {
    name: 'Challenge',
    doc: 'A "your turn" exercise: a prose prompt, a starter genome, a goal, and the reference solution the test suite checks.',
    attrs: {},
    children: ['Starter', 'Solution', 'Goal'],
  },
  Starter: {
    name: 'Starter',
    doc: 'The genome the learner begins from. Must NOT already satisfy the goal.',
    attrs: { ref: t('string', 'A named starter genome id, instead of inline text.') },
    children: 'raw',
    parents: ['Challenge'],
  },
  Solution: {
    name: 'Solution',
    doc: 'The intended solution. Never shown to the learner — it is what proves the challenge is solvable.',
    attrs: {
      budget: t('int', 'Step budget the solution must solve within.', { default: 500 }),
      ref: t('string', 'A named starter genome id, instead of inline text.'),
    },
    children: 'raw',
    parents: ['Challenge'],
  },
  Goal: {
    name: 'Goal',
    doc: 'A deterministic success condition, checked live against the running creature.',
    attrs: {
      kind: t('enum', 'Which condition to check.', { values: GOAL_KINDS, required: true }),
      label: t('string', 'The kid-facing one-liner shown on the goal chip.', { required: true }),
      reg: t('register', 'Which register (regAtLeast / regEquals).', {
        values: ['A', 'B', 'C', 'D'],
      }),
      value: t('int', 'Target number (regAtLeast / regEquals / sizeEquals).'),
      pct: t('int', 'Percent of the daughter filled (daughterFill).'),
      population: t('int', 'Target live population (reach-pop).'),
      size: t('int', 'Genome-size threshold in bytes (shrink-genome).'),
      cycles: t('int', 'Survival horizon (survive).'),
      within: t('int', 'Cycle budget (replicates / diversity).'),
      count: t('int', 'How many (replicates / diversity).'),
      by: t('int', 'Decision cycle (out-populate).'),
      tier: t('enum', 'required blocks completion; bonus never does.', {
        values: ['required', 'bonus'],
        default: 'required',
      }),
    },
    children: 'none',
    parents: ['Challenge', 'EntityDesigner', 'Simulation'],
  },

  // -- the real soup (worker-backed) -----------------------------------------
  Simulation: {
    name: 'Simulation',
    doc: 'A full worker-driven soup: tank, charts, inspector. For population-scale lessons.',
    attrs: {
      scenario: t('string', 'A named scenario preset.', { default: 'soup-small' }),
      seed: t('int', 'uint32 PRNG seed — the one determinism control.', { default: 1 }),
      starter: t('string', 'Named starter genome id.', { default: 'ancestor' }),
      subset: t('string', 'Named active instruction subset.'),
      cycles: t('int', 'Default run budget.'),
      editable: t('bool', 'Let the learner edit and inject genomes.', { default: false }),
    },
    children: ['Goal'],
  },

  // -- document structure -----------------------------------------------------
  Fold: {
    name: 'Fold',
    doc: 'Tooltip cut. Everything above it is the hover tooltip; the whole document is the page.',
    attrs: {},
    children: 'none',
  },
  Callout: {
    name: 'Callout',
    doc: 'A styled aside.',
    attrs: {
      kind: t('enum', 'Which treatment.', {
        values: ['note', 'tip', 'warning'],
        default: 'note',
      }),
    },
    children: 'prose',
  },
});

// ---------------------------------------------------------------------------
// Casing: PascalCase is canonical, kebab-case is accepted. `entity-designer`
// and `EntityDesigner` are the same tag, so a document reads consistently
// whichever convention its author reaches for.
// ---------------------------------------------------------------------------
export function kebabOf(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

const BY_ALIAS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.keys(MANIFEST).flatMap((n) => [
      [n.toLowerCase(), n],
      [kebabOf(n), n],
    ]),
  ),
);

/** Canonical PascalCase name for an authored tag, or undefined if unknown. */
export function canonicalTag(raw: string): string | undefined {
  return BY_ALIAS[raw.toLowerCase()];
}

export function specOf(raw: string): TagSpec | undefined {
  const name = canonicalTag(raw);
  return name ? MANIFEST[name] : undefined;
}

/** Tags whose children are verbatim text — the parser must not descend into them. */
export function isRawTag(name: string): boolean {
  return MANIFEST[name]?.children === 'raw';
}

export const TAG_NAMES: readonly string[] = Object.freeze(Object.keys(MANIFEST));
