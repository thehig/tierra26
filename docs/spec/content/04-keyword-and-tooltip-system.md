# Keyword & Tooltip System — Engineering Spec              (Code: KEYWORD · Milestone: M3)

**Status:** v1. Owns the **color-coded, hoverable term registry** that powers the
Nintendo-style highlighting across all prose (tutorial reader, per-instruction wiki pages,
inspector, playground hovers). Defines the **Keyword registry** (verbs + concept nouns, each
with a color category, a kid line, a "more" machine/deeper line, aliases, and optional links)
and the **auto-linking contract** the renderer obeys. This doc is **content + contract, not a
renderer**: it specifies the registry data model and the deterministic term-resolution rules;
the actual span/tooltip rendering lives in the UI layer (which consumes this).

Upstream: [`00-overview.md`](00-overview.md) (§1 teaching model, §3 `{term}` markup +
auto-highlight, §4 doc set, §5 contracts, §6 CONTINV-KEYWORDS),
[`../genescript/02-vocabulary-and-keywords.md`](../genescript/02-vocabulary-and-keywords.md)
(VOCAB — the verb color categories + kid/machine tooltips; **the KEYWORD registry extends this
with concept nouns and must stay consistent**), [`SPEC.md`](../SPEC.md) §4 (keyword system as a
core UX primitive; two reading levels of the same word), [`03-per-instruction-pages.md`]
(INSTRPAGE — a verb keyword may deep-link to its wiki page). Conforms to the engine anchor
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §8 (doc template
§8.1, criterion IDs §8.2, `it.todo` test conventions §8.3, fidelity tags §8.4).

**Contracts obeyed:** **C-CON-SOURCE** (verb facts — term, color, kid/machine lines — are
**pulled from VOCAB, never copied**; concept-noun facts live here as the single source), **C-CON-KID**
(every kid line uses plain age-8–16 language, shared with GS DIAG C-GS-KID), **C-CON-DATA**
(the registry is declarative data validated against a schema; no executable authoring).
Satisfies global invariant **CONTINV-KEYWORDS** (auto-linking only links registry terms and is
deterministic) and contributes to **CONTINV-COVERAGE** (every classic-32 verb has a keyword
entry).

---

## 1. Purpose & responsibility

This system owns the **keyword registry**: the closed, authoritative set of terms — every
GeneScript **verb** (from VOCAB) plus the **concept nouns** the story needs (`soup`, `daughter`,
`template`, `parasite`, `reaper`, `slicer`, `genotype`, `mutation`, …) — and everything the UI
needs to turn a plain word in prose into a **colored, hoverable span**. It must guarantee:

- **Total verb coverage, no duplication.** Every classic-32 verb has exactly one keyword entry,
  and that entry's term/color/kid/machine facts are **derived from the VOCAB record**, not
  restated (C-CON-SOURCE). Concept nouns are defined *here* (their single source), one entry each.
- **A deterministic auto-linking contract.** Given the same prose and the same registry, the
  renderer produces the **same set of linked spans** every time: longest-match, case-insensitive,
  word-boundary-respecting, with explicit force/suppress overrides and a fixed resolution order
  (§4). Nothing outside the registry is ever linked (CONTINV-KEYWORDS).
- **The two-reading-levels model.** Each entry carries a **kid line** (one plain sentence, shown
  by default) and a **more line** (the machine truth for verbs, the deeper concept explanation
  for nouns), realizing SPEC §4's "two reading levels of the same word."
- **A stable color vocabulary.** Every entry declares exactly one **color category**; verbs reuse
  VOCAB's five-role palette, and concept nouns use one added **concept** role, so a kid learns
  the color meaning once and it holds everywhere (prose, editor, inspector).

This doc is **data + contract**, not behavior UI: it specifies the registry and the resolution
rules that make highlighting deterministic; **rendering (the span element, the tooltip card,
theming to hex) is the UI layer's job** and consumes this contract rather than reinventing it.

---

## 2. Interfaces

The registry is exposed as declarative, engine-free data plus a pure resolver used only in tests
and by the UI (the resolver returns *spans to render*, it does not render):

```ts
// Color highlighting role. Verbs reuse VOCAB's five roles verbatim; concept nouns add one.
// (see VOCAB §5 for action/register/marker/control/value; 'concept' is defined here, §3.)
type KeywordCategory =
  | 'action' | 'register' | 'marker' | 'control' | 'value'  // reused from VOCAB (C-CON-SOURCE)
  | 'concept';                                                // concept nouns (soup, daughter, …)

// The two reading levels (SPEC §4): kid line (default) + a deeper "more" line.
interface KeywordTooltip {
  kid: string;      // one plain sentence, ages 8-16, no jargon (C-CON-KID)
  more: string;     // the "more" line: for a verb = VOCAB machine truth; for a noun = deeper truth
}

// One registry entry. A verb entry DERIVES its facts from VOCAB (does not copy them).
interface KeywordEntry {
  term: string;                 // canonical display term, lower-case (unique across the registry)
  aliases?: readonly string[];  // other surface forms that resolve to this entry (plural, synonym)
  kind: 'verb' | 'concept';     // verb = mirrors a VOCAB verb; concept = a noun defined here
  category: KeywordCategory;    // exactly one color role
  tooltip: KeywordTooltip;
  mnemonic?: string;            // verb only: the VOCAB mnemonic this entry mirrors (the join key)
  link?: KeywordLink;           // optional: deep-link target for "read more"
}

// Where "read more" navigates (data only; the UI owns routing).
type KeywordLink =
  | { kind: 'instruction'; mnemonic: string }  // -> per-instruction page [03]
  | { kind: 'concept'; slug: string };         // -> a concept explainer page

const KEYWORDS: readonly KeywordEntry[]; // the §3 registry (verbs derived from VOCAB + concepts)

// A resolved span the UI should render (does NOT render; pure + deterministic).
interface KeywordSpan { start: number; end: number; term: string; category: KeywordCategory; }

// Pure resolver: scan prose, return the spans to color (§4 rules). Deterministic.
function resolveKeywords(prose: string, registry: readonly KeywordEntry[]): readonly KeywordSpan[];
```

**Importers/consumers:** the tutorial reader (auto-links prose), the per-instruction wiki pages
(hover + "read more" links), the inspector and playground hovers (identical tooltip content for
a given term — single source), and the [01] validator (schema-checks the registry). Verb entries
are **built from** the VOCAB table at load time (a derivation step, §5), not hand-copied.

---

## 3. Data structures — the registry

`KEYWORDS` is a frozen array with two populations:

### 3.1 Verb entries (derived from VOCAB — C-CON-SOURCE)

One verb entry per classic-32 VOCAB verb. Each entry is **projected from** its `VerbEntry`
(`packages/genescript` VOCAB §4), joined by `mnemonic`:

- `term` = the VOCAB `verb` (e.g. `copy-byte`), `kind = 'verb'`.
- `category` = the VOCAB `category` **unchanged** (action/register/marker/control/value).
- `tooltip.kid` = VOCAB `tooltip.kid`; `tooltip.more` = VOCAB `tooltip.machine`. **Not copied
  into this doc** — the derivation reads VOCAB so the two never drift (C-CON-SOURCE).
- `aliases` = optional friendly plurals/synonyms that are unambiguous (never another verb's term).
- `link` = `{ kind: 'instruction', mnemonic }` → the per-instruction page [03].

Because these are a projection, VOCAB stays the single source of the verb's term, color, and both
tooltip lines; the KEYWORD registry adds only the alias set and the deep-link.

### 3.2 Concept-noun entries (defined here — single source)

The nouns the emergence story needs, each authored here (their single source of truth). Minimum
set (extensible; must stay consistent with the engine glossary in
[`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md) §6):

| term | aliases | category | kid line (default) | more (deeper truth) | link |
|---|---|---|---|---|---|
| `soup` | tank | concept | The shared space where all the creatures live. | The circular byte-addressed address space; one byte = one instruction cell. | concept:soup |
| `daughter` | daughter cell, baby | concept | The new cell a creature is copying itself into. | The block a creature has `make-space`-allocated and is writing; write-protected to the mother until `divide`. | concept:daughter |
| `template` | landmark, marker | concept | A signpost in the code you can jump to. | A run of `mark-0`/`mark-1` (nop0/nop1) matched by its bit-complement — how addresses are found. | concept:template |
| `genome` | code | concept | The little program that *is* a creature. | The creature's byte sequence (opcodes in the active set). | concept:genome |
| `genotype` | species | concept | A family of creatures with the exact same code. | An equivalence class of identical genomes; gets an id/label (e.g. `0080aaa`). | concept:genotype |
| `mutation` | mutations | concept | A tiny random change to the code. | Bit-flip / flaw / copy-error + divide-time insert/delete/crossover; the raw material of evolution. | concept:mutation |
| `parasite` | parasites | concept | A creature that borrows another's copy code to breed. | A genome that locates a host's copy routine by template and executes it — the write-protection niche. | concept:parasite |
| `reaper` | — | concept | The thing that decides who dies when the tank is full. | The death queue: its head dies when space is needed; errors move a creature up, breeding moves it down. | concept:reaper |
| `slicer` | scheduler | concept | Shares out turns so every creature gets to run. | The round-robin scheduler; slice size scales with genome size — CPU time is the energy resource. | concept:slicer |

Concept `category` is always `concept`. `link.kind` is `concept` (a concept explainer page), not
an instruction page. The list is a **minimum**; more nouns (e.g. `stack`, `register`, `divide-gate`,
`immunity`) may be added as chapters need them, each obeying the same shape.

### 3.3 Registry invariants (asserted in §8)

- Every classic-32 verb has exactly one verb entry, joined to a real VOCAB mnemonic (KEYWORD-001/002).
- Every concept noun in §3.2 has exactly one entry (KEYWORD-003).
- `term` values are **globally unique**, and every `alias` is unique and collides with no `term`
  or other `alias` (a term→entry map must be unambiguous — KEYWORD-004).
- Every entry has a `category` in the six roles; verb categories equal their VOCAB category and
  concept entries are `concept` (KEYWORD-005).
- Every entry has a non-empty `kid` and a non-empty `more`; kid obeys C-CON-KID (KEYWORD-006).
- Verb entries carry their VOCAB `mnemonic` and derive term/color/kid/more from it — no verb fact
  is restated independently of VOCAB (KEYWORD-007, C-CON-SOURCE).

---

## 4. Behavior / algorithms — the auto-linking contract

The renderer scans a prose string and turns known terms/aliases into colored, hoverable spans.
`resolveKeywords(prose, registry)` implements it; the UI wraps each returned span. The contract:

### 4.1 What is a "known term"

A surface substring resolves iff, **case-insensitively**, it equals some entry's `term` or one of
its `aliases`, matched **on word boundaries** (a term is only linked when bordered by non-word
characters / string ends — `copy` inside `copyright` is not a match). Only registry terms are ever
linked; unknown words are left plain (CONTINV-KEYWORDS).

### 4.2 Deterministic resolution order (fixed, top to bottom)

For each candidate position, exactly one outcome is chosen by this order — the algorithm is a
single left-to-right scan and never revisits linked text:

1. **Never inside a code span.** Text inside inline code (`` `verb` ``) or fenced code blocks is
   **skipped entirely** — code is never auto-linked (KEYWORD-011). (`` `verb` `` gets its own
   INSTRPAGE link via the [00 §3] code-style rule, which is out of scope here.)
2. **Explicit suppress `{!word}`** — the author opts *out*: `{!copy}` renders the literal word
   with **no** link, even if `copy` is a known term (KEYWORD-010).
3. **Explicit force `{term}`** — the author opts *in*: `{soup}` always resolves to that entry
   (error at validate time if `term` is unknown), overriding auto-scan for that span (KEYWORD-009).
4. **Longest-match auto-scan** — among all registry terms/aliases that match at the current
   position, the **longest** surface form wins (so `daughter cell` beats `daughter`), then the
   scan resumes *after* the matched span; overlapping shorter matches inside it are not linked
   (KEYWORD-008).
5. **First-wins tie-break** — if two entries match the *same* surface substring at the same
   position (only possible via an alias collision, which §3.3 forbids), resolution is by the
   registry's array order; but because terms+aliases are globally unique (KEYWORD-004), this case
   cannot arise in a valid registry. The rule is stated so resolution is *total and deterministic*
   regardless (KEYWORD-012).

The same `(prose, registry)` input always yields the identical ordered span list (KEYWORD-012).

### 4.3 Pseudocode

```
resolveKeywords(prose, registry):
  index = build case-insensitive map: term|alias -> entry            # (validate: unique keys)
  maxLen = longest term/alias word-count
  spans = []
  for each region of prose that is NOT code (skip inline/fenced code):   # rule 1
    for each explicit {!word}: emit literal, consume, no span            # rule 2
    for each explicit {term}:  emit span(index[term]); error if missing  # rule 3
    scan left-to-right over remaining plain text:
      at a word boundary, try the LONGEST candidate first (down to 1):   # rule 4
        if candidate (case-folded) in index:
          spans.push({start,end, term:index[c].term, category:index[c].category})
          advance past candidate                                          # no re-entry
          continue
      else advance one char
  return spans in ascending start order                                   # rule 5 / determinism
```

The resolver is **pure** (no I/O, no clock, no `Math.random`) so its output is a deterministic
function of its inputs — the property CONTINV-KEYWORDS asserts.

---

## 5. Interconnections

- **Reads VOCAB (`@tierra26/genescript`).** Verb entries are a projection of the VOCAB table
  (join on `mnemonic`); term, color, kid, and more come from there (C-CON-SOURCE). If VOCAB adds,
  removes, or recolors a verb, the verb population changes with **zero edits** to §3.1.
- **Consumed by the UI layer (next spec).** The tutorial reader, wiki pages, inspector, and
  playground hovers call `resolveKeywords` and render the returned spans + tooltip cards. This doc
  is the **contract**; the UI owns the span element, the two-level tooltip card, and theming the
  six roles to concrete colors (VOCAB §5 palette + one concept color).
- **Feeds / is fed by INSTRPAGE [03].** A verb entry's `link` points at the per-instruction page;
  a concept entry may point at a concept explainer. INSTRPAGE and KEYWORD share the same kid/more
  content for a verb because both trace back to VOCAB (no third copy).
- **Validated by CONTENT [01].** The [01] schema validator checks the registry shape (unique
  terms/aliases, valid categories, non-empty tooltips, resolvable `{term}` forces in shipped prose)
  as part of CONTINV-VALID.
- **Contributes to CONTINV-COVERAGE** with INSTRPAGE: every classic-32 verb has both a page and a
  keyword entry (no orphan instructions).

---

## 6. Determinism & edge cases

- **Determinism (CONTINV-KEYWORDS / C-CON-DET spirit):** `resolveKeywords` is pure; identical
  inputs → identical span list, always (KEYWORD-012). No map/object key-order dependence — the
  scan is positional and the tie-break is array order.
- **Case-insensitive, canonical display:** `SOUP`, `Soup`, `soup` all resolve to the `soup` entry;
  the registry stores the canonical lower-case `term`, and the span reports the entry's `term`/
  `category` (the UI colors the *original* surface text). (KEYWORD-013)
- **Word boundaries:** matches require non-word borders; a term never links inside a larger word
  (`reaper` in `reapers` links only if `reapers` is an alias). (KEYWORD-013)
- **Longest-match, no overlap:** `daughter cell` wins over `daughter`; after a span is emitted the
  scan resumes past it, so nested shorter terms inside a matched span are not double-linked.
- **Code is inviolate:** nothing inside inline code or fenced blocks is auto-linked, even a `{term}`
  written inside code is literal (the force/suppress syntax is a *prose* construct). (KEYWORD-011)
- **`{term}` on an unknown word is an authoring error** caught at validate time (not silently
  rendered as plain), so typos surface (KEYWORD-009). `{!word}` on any word (known or not) is always
  legal and yields literal text (KEYWORD-010).
- **Alias safety:** an alias that equals another entry's term/alias is rejected by the schema
  (KEYWORD-004) so resolution can never be ambiguous.

---

## 7. Fidelity notes

- **[MOD]** The keyword *palette* reuses VOCAB's five roles unchanged and adds exactly one
  **concept** role for nouns — a content decision, not an engine one; keeps "one color = one idea"
  learnable (SPEC §4). No engine behavior is touched.
- **[MOD]** Verb keyword facts are a **projection** of VOCAB rather than a second table — a
  single-source design choice (C-CON-SOURCE) that trades a build-time derivation step for
  guaranteed non-drift.
- **[CORE]** The two-reading-levels tooltip (kid line + "more") realizes SPEC §4's "two reading
  levels of the same word" at term granularity, matching VOCAB's kid/machine tooltip model.
- **[OPTIONAL]** The concept-noun set in §3.2 is a *minimum*; additional nouns are added per
  chapter need. Concept explainer pages (`link.kind: 'concept'`) may lag the registry — a term can
  exist and hover with just its kid/more lines before its explainer page ships.

---

## 8. Acceptance criteria

Each maps 1:1 to an `it.todo` in `packages/content/test/04-keyword.test.ts`.

- **KEYWORD-001** — every classic-32 GeneScript verb (all 32 VOCAB verbs) has **exactly one**
  keyword entry with `kind: 'verb'` (total verb coverage; no orphan verb — contributes CONTINV-COVERAGE).
- **KEYWORD-002** — every verb entry joins to a **real** VOCAB mnemonic (its `mnemonic` is an
  actual classic-32 dictionary mnemonic), and the join is a bijection verb↔VOCAB entry.
- **KEYWORD-003** — every required concept noun (`soup`, `daughter`, `template`, `genome`,
  `genotype`, `mutation`, `parasite`, `reaper`, `slicer`) has **exactly one** entry with
  `kind: 'concept'`.
- **KEYWORD-004** — all `term` values are globally unique, and every `alias` is unique and
  collides with no other `term` or `alias` (the term→entry map is unambiguous).
- **KEYWORD-005** — every entry's `category` is one of the six roles
  (`action`/`register`/`marker`/`control`/`value`/`concept`); a verb entry's category **equals its
  VOCAB category** and every concept entry's category is `concept`.
- **KEYWORD-006** — every entry has a non-empty `tooltip.kid` (plain age-8–16 language: no
  mnemonic string, no register-letter jargon, no word "opcode" — C-CON-KID) and a non-empty
  `tooltip.more`.
- **KEYWORD-007** — verb entries **derive** their term/color/kid/more from VOCAB (joined by
  `mnemonic`), not from an independent copy: a verb entry's term == VOCAB `verb`, category ==
  VOCAB `category`, kid == VOCAB `tooltip.kid`, more == VOCAB `tooltip.machine` (C-CON-SOURCE).
- **KEYWORD-008** — auto-linking is **longest-match**: where two registry terms/aliases match at a
  position (e.g. `daughter cell` vs `daughter`), the longest surface form is linked and the scan
  resumes past it (no nested double-link).
- **KEYWORD-009** — an explicit `{term}` **forces** a link to that entry (overriding auto-scan),
  and a `{term}` naming an unknown term is an authoring error at validate time.
- **KEYWORD-010** — an explicit `{!word}` **suppresses** linking: the word renders literally with
  no span, even when it is a known registry term.
- **KEYWORD-011** — text inside inline code (`` `verb` ``) and fenced code blocks is **never**
  auto-linked (code spans are inviolate).
- **KEYWORD-012** — auto-linking **only** links registry terms/aliases and is **deterministic**:
  the same `(prose, registry)` yields the identical ordered span list every time; unknown words are
  left plain (CONTINV-KEYWORDS).
- **KEYWORD-013** — matching is **case-insensitive** and **word-boundary-respecting**: `SOUP`/`Soup`
  resolve to `soup`, and a term is not linked inside a larger word (`copy` in `copyright` is plain).

---

## 9. Open questions

1. **Concept color count** — one `concept` role for all nouns, or should high-salience nouns
   (`parasite`, `reaper`) get their own accent? (Spec assumes one role to keep the palette
   learnable; flagged for the UI-theme spec.)
2. **First-occurrence vs every-occurrence linking** — does the reader color *every* mention of a
   term in a lesson, or only the first (to reduce noise)? (Resolver returns all; a "first-only"
   filter, if wanted, is a UI/authoring policy layered on top — determinism holds either way.)
3. **Alias breadth** — how aggressive should default plural/synonym aliases be before they risk
   accidental matches? (Kept conservative in §3; each alias is schema-checked for collisions.)
4. **Concept explainer pages** — do concept nouns get full wiki pages like instructions, or short
   inline explainers? (INSTRPAGE covers verbs; concept pages are a possible [03]-sibling — deferred.)
5. **`{term}` inside code** — confirmed literal (KEYWORD-011); revisit if authors want a way to
   link a term shown *as* code (likely a separate explicit syntax, not auto-scan).
