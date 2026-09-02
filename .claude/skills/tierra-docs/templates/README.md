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
      succeed, flags cleared without undoing a consequence — and aims `## Try it` at a
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

## `## Try it` — the page's only playground

The templates carry a `## Try it` section holding an `<EntityDesigner>`. This works
because the manifest allows `EntityDesigner` at top level and the Bible page renders the
whole document body, so a live stage in a reference page behaves exactly as it does in a
lesson.

It is now the **only** playground on an opcode page. The page previously appended its own
`<h3>Try it</h3>` built from `INSTRPAGE`, and that has been deleted — it was the same
ancestor soup on 27 of the 32 pages (only the seed differed, plus one appended line on
five of them), so it demonstrated the ancestor rather than the instruction. A
population-scale tank on a page about "add one to box A" was the wrong tool.

The consequence to know while regenerating: **until a page authors a `## Try it`, it has
no playground at all.** Write one. Aim it at whatever `## Edge Cases` calls surprising —
a preset `<State>` one step from a boundary is the whole point.

## `INSTRPAGE` is still a second copy of three things

`packages/content/src/instrpage.ts` holds an `AUTHORED` table for all 32 verbs:

| INSTRPAGE | Bible | State |
|---|---|---|
| `summary` | first sentence of `## Simple` | duplicated |
| `mistakes` | `## Edge Cases` | **duplicated and already drifted — the bullet counts differ on all 32 pages** |
| `seeAlso` | `## See also` | duplicated |
| `prompt` + `scenarios` | `## Try it` | **no longer rendered anywhere** — dead since the playground moved into the document |
| `targets` | — | still live: the tooltip animation data, which a document cannot express |

`OpcodeTooltip` and the reader's keyword linking still call `pageOf`, so the module stays;
what is finished is the *opcode page's* dependency on it. Retiring `summary`, `mistakes`,
`seeAlso` and the now-dead `scenarios` is the next consolidation — it touches
`03-instrpage.test.ts` and `_invariants.test.ts`, which is why it is a separate job.

Do **not** write a regenerated page from the INSTRPAGE copy. Where the two disagree
today, neither has been checked against the engine.
