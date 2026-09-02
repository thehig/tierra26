# Templates

Three skeletons, one per document kind. They are **not** examples to read — the
exemplars are the real pages. They are the shape a regenerated page must end up in, with
every decision marked.

## Using one

```bash
node --experimental-strip-types .claude/skills/tierra-docs/scripts/doclint.ts new opcode subCAB
node --experimental-strip-types .claude/skills/tierra-docs/scripts/doclint.ts facts  subCAB
```

`new` prints the template with everything **derivable from the engine already filled in**
— `mnemonic`, `name` (the gene), `takes_target` and `bytes` come from the dictionary row,
never from your fingers. An existing page's `emoji` and `category` are carried forward,
because regenerating a page should not silently restyle every chip that names it.

`facts` prints that dictionary row plus the handler to read. Everything it labels *NOT
derivable* — `reads`, `writes`, `flags_set`, `can_error` — has to come from reading that
handler. Guessing them from the mnemonic is exactly how a page goes subtly wrong.

## Placeholders

`«…»` — never a token, never a tag, and greppable. Nothing may ship containing one:

```bash
grep -rn '«' docs/          # must be empty before you commit
```

Angle-guillemets are used precisely because `{…}` and `<…>` are the language. A
placeholder can never be mistaken for, or accidentally left as, a real construct.

## Done checklist

A page is finished when all of these are true. The first three are machine-checked; the
rest are the reason a human is doing this.

**Every kind**

- [ ] `npm run docs:lint -- <path>` — 0 errors, 0 warnings.
- [ ] `npm test` — parses, validates, and the corpus invariants hold.
- [ ] `grep '«' <path>` — empty.
- [ ] Every term the page names has a card in its block; `--all` reviewed, each
      `UNCHIPPED` and `BARE-LETTER` line consciously accepted or fixed.
- [ ] No token inside `*emphasis*`; no token in frontmatter.

**Opcode**

- [ ] Frontmatter matches the dictionary row (`doclint facts <mnemonic>`).
- [ ] `reads` / `writes` / `flags_set` / `can_error` were read off the handler, not
      inferred from a sibling page.
- [ ] `## Reads / Writes / Flags` says what it does **not** touch, explicitly.
- [ ] `## Advanced` gives the operation, the coercion, the order of gates, and the
      do-nothing-on-failure cases.
- [ ] `## Simple` passes the one test: every sentence is still true at the Advanced
      level (`references/voice.md`).
- [ ] First sentence of `## Simple` stands alone — it is the Bible index card.
- [ ] `## Edge Cases` covers the silences: no-fault wraps, thresholds that still
      succeed, flags cleared without undoing a consequence — and aims `## Watch it` at a
      boundary wherever one can be shown rather than described.
- [ ] `## See also` links resolve and lead somewhere a reader wants next.

**Concept**

- [ ] `title` reads exactly `slug (a short lower-case noun phrase)` — the chip name and
      the index gloss are both cut from it.
- [ ] The page chips its own subject in the first sentence.
- [ ] `## Advanced` names the constants a reader would grep for.

**Lesson**

- [ ] One idea per `<Waypoint>`, with a heading that names it.
- [ ] `lede` is plain text — no markdown, no tokens.
- [ ] The starter does **not** already satisfy the goal; the solution does, within
      `budget`. (`npm test` proves both.)
- [ ] Every verb used is unlocked by this lesson or a prerequisite.
- [ ] `no` matches folder order; `requires` continues the chain unbroken.

## Two decisions to make before the regeneration run

Both are called out here rather than silently baked into the templates.

### 1. `## Watch it` — a live stage inside a Bible page

The templates include an optional `## Watch it` section holding an `<EntityDesigner>`.
This works today: the manifest allows `EntityDesigner` at top level, and the Bible page
renders the whole document body, so a stage in a Bible page renders like any other tag.

It is named `Watch it` and **not** `Try it` on purpose — the opcode page already appends
its own `<h3>Try it</h3>` from `INSTRPAGE` after the document body, and two "Try it"
headings on one page would be a mess. If decision 2 goes the obvious way, rename this to
`## Try it` and delete the hardcoded one.

`## Watch it` is optional and `docs:lint` does not require it. Add it when the
instruction is a *motion* — a head jumping, a pointer walking, a daughter filling — and
skip it when the instruction is a fact.

### 2. `INSTRPAGE` is a second, drifting copy of the Bible

`packages/content/src/instrpage.ts` holds an `AUTHORED` table with, for all 32 verbs:
`summary`, `mistakes`, `seeAlso`, `prompt`, `targets`.

Three of those are already in the Bible, authored twice:

| INSTRPAGE | Bible | State |
|---|---|---|
| `summary` | first sentence of `## Simple` | duplicated |
| `mistakes` | `## Edge Cases` | **duplicated and already drifted — the bullet counts differ on all 32 pages** |
| `seeAlso` | `## See also` | duplicated |
| `prompt` + scenario | — | only in INSTRPAGE (the runnable playground) |
| `targets` | — | only in INSTRPAGE (tooltip animation data) |

The docs-are-the-source migration ended this duplication everywhere else; INSTRPAGE is
what is left. The regeneration is the moment to finish it: fold `summary`, `mistakes`
and `seeAlso` into the Bible pages (they are already there — the job is deleting the
copies and repointing the readers), and leave INSTRPAGE holding only what a document
cannot express, or move the scenario into `## Watch it` and leave it holding only
`targets`.

Do **not** write a regenerated page from the INSTRPAGE copy. Where the two disagree
today, neither has been checked against the engine.
