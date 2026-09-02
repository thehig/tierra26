---
name: tierra-docs
description: Author or edit the tierra26 documentation corpus — docs/bible/opcodes/*.md, docs/bible/concepts/*.md, docs/lessons/*.md. Covers the doclang authoring language ({token} names, block component tags, MiniMark markdown), the Bible's page shape, the Simple/Advanced voice for 8–16 year olds, and how to verify a claim against the tierra26 engine source or original Tierra v6.02. Use whenever writing, reviewing, retagging or regenerating any document under docs/.
---

# Authoring the tierra26 docs

`docs/` is the source of truth, and the app is a presentation layer over it. A Bible
page IS the hover card, the wiki page and the index gloss; a lesson IS the chapter.
So a document is not prose about the machine — it is the machine's own description,
and it has to be both **kid-readable** and **engine-accurate** at once.

## Rule zero: read the repo, never your memory

The vocabulary changes. A concept page added this week is part of the language; a
gene renamed in frontmatter renames every chip. **Never write a token or a tag from
recall.** Start every authoring session with:

```bash
npm run docs:vocab
```

That prints, from disk and from `packages/content/src/manifest.ts`: every `{token}`
that resolves (registers, flags, all concept slugs with their known synonyms, all 32
opcodes by mnemonic *and* display name), every component tag with its attributes,
children and legal parents, and the enum values for `focus`, `run-until` and `Goal
kind`. If it is not in that output, it does not resolve.

The ground truth behind it, when you need to look further:

| Question | Read |
|---|---|
| What tokens resolve, and in what order? | `resolveToken` in `packages/content/src/doclang.ts` |
| What tags exist, with what attributes? | `MANIFEST` in `packages/content/src/manifest.ts` |
| What markdown is supported? | `toBlocks` in `packages/app/src/doc/MiniMark.tsx` |
| What frontmatter is required? | `REQUIRED_FRONTMATTER` in `doclang.ts`, plus `scripts/gen-bindings.ts` |
| What does this opcode actually do? | `packages/engine/src/handlers.ts` — see `references/fidelity.md` |

## The language is two forms and no overlap

A **TAG** is a component and owns its whole line: `<Scrolly>`, `<Waypoint focus="genome">`,
`<EntityDesigner>`, `<Challenge>`. A **TOKEN** is a name and lives inside a sentence:
`{incA}`, `{jmpb top}`, `{register-c}`, `{flag-e}`, `{soup}`, `{template signpost}`.
Nothing is written both ways — `<Chip>` was retired precisely because it was a second
way to write a token.

Four token namespaces, resolved in a fixed order:

```
{register-a}..{register-d}   the four registers      -> renders "A", register-coloured
{flag-e} {flag-s} {flag-z}   the three flags         -> renders "E"
{soup} {save-pile} {label}   a concept with a page   -> renders the slug
{incA} {grow-a}              an instruction          -> mnemonic or display name
{jmpb top}                   ...with its label
{template signpost}          ...a concept, said in the word the lesson teaches
```

That last form is the one to reach for constantly. A lesson says "signpost"; the Bible
files it under `template`. `{template signpost}` reads *signpost* on the page and still
opens the template card — so a lesson keeps its own vocabulary without inventing a
second one. **Tag the word the sentence actually uses.**

Full detail, including how a token renders in prose, in a tooltip and on an index
card: `references/tokens.md`. Tags and frontmatter: `references/tags.md`.

## The five traps

Every one of these has shipped at least once. They are all invisible to `npm test`,
which is why `npm run docs:lint` exists.

1. **A token cannot live inside `*emphasis*`.** `splitInline` cuts tokens out *first*,
   so the two asterisks land in different text runs, never pair up, and paint as
   literal `*` characters. Write `**raises** the {flag-e} flag`, never
   `**raises the {flag-e} flag**`. The chip *is* emphasis — usually just drop the bold.
2. **Frontmatter is plain text.** `lede`, `title` and every other frontmatter value
   are printed as strings and never go through MiniMark. A token there shows its braces.
3. **A target is ONE word.** `{soup free space}` fails the token shape and renders as
   literal text, braces included. Chip one word of the phrase: `the free {soup space}`
   — or reword.
4. **A bare capital `A` is usually the English article.** "A loop with no exit", "A
   matching pattern", "A run of them". Never sweep single letters with find-and-replace;
   this is how `A signpost` once became `{register-a} signpost`.
5. **A register or flag takes no second word.** `{register-c notebook}` has nowhere to
   put it. It is now a validation error rather than a silent drop.

## How much to tag

One card per term **per block** — a `<Waypoint>` in a lesson, a paragraph or a single
list item in the Bible. Each waypoint is its own screen, so a term earns its card again
in the next one; a second plain mention inside the same paragraph stays plain, because
dense reference prose does not want a wall of chips.

- **A page does chip its own subject.** `label.md` opens "A {label} is a friendly name";
  `register.md` names `{register-a}`..`{register-d}` and its four `{register boxes}`.
- **Don't double up.** `notebook {register-c}` needs no `{register}` chip — the register
  chip already carries that glyph and card. Same for "Flags:" beside `{flag-e}`.
- **`## See also` stays links.** It is navigation, not prose.

## Workflow

1. `npm run docs:vocab` — see what resolves right now.
2. Write or edit the document. Follow the page shape for its kind
   (`references/page-shapes.md`) and the Simple/Advanced voice (`references/voice.md`).
3. Verify every factual claim against the engine, and every original-Tierra claim
   against `reference/tierra-v6.02/` with a `file:line` citation
   (`references/fidelity.md`).
4. `npm run docs:lint` — must be **0 errors**. Warnings are real defects; read them.
   Pass paths to scope it (`npm run docs:lint -- docs/bible/opcodes/mal.md`), and `--all`
   to add the two judgment lists: `UNCHIPPED` (a term named with no card in its block)
   and `BARE-LETTER` (is that an article or register A?). Neither can be a rule; both are
   worth reading.
5. `npm test` — the corpus test proves it parses and validates, that the Bible is still
   a bijection with the engine's instruction dictionary, and that every starter and
   solution genome still compiles and solves.
6. If you touched an opcode/concept page's `name`, `emoji` or `category`, run
   `npm run gen:bindings` — those frontmatter fields are codegen input.

`npm run docs:lint` and `npm test` do not overlap: the first catches what renders wrong,
the second catches what fails to parse or contradicts the engine. Run both.

## References

- `references/tokens.md` — the token grammar in full: namespaces, synonyms, how a token
  flattens into a tooltip and an index gloss, and every trap with its cause.
- `references/tags.md` — the component tags, per-kind frontmatter, and the MiniMark
  markdown subset (including what is *not* supported).
- `references/page-shapes.md` — the required shape of an opcode page, a concept page and
  a lesson, and what belongs in each section.
- `references/voice.md` — writing Simple without diluting the concept, and Advanced
  without drifting from the engine. The 8–16 audience, and the words this project uses.
- `references/fidelity.md` — the ground-truth chain. Which source is authoritative for
  what, how to cite original Tierra, and where tierra26 deliberately differs.
