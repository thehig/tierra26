# Tags, frontmatter, and the markdown subset

## Reading the tag vocabulary

`packages/content/src/manifest.ts` is the tag vocabulary **as data**. Every check the
validator performs is driven from that table, and the app's renderer registry is
asserted to have exactly its keys. Adding a component is one row there plus one registry
entry — nothing else.

So do not learn the tag list; print it:

```bash
node --experimental-strip-types .claude/skills/tierra-docs/scripts/doclint.ts vocab
```

Each row gives the tag's own `doc` string, what may nest inside it, which parents it is
legal in, and its attributes (`*` = required).

## Shape rules the parser enforces

- **A tag owns its line.** `<Waypoint focus="genome">` must be alone on the line, as
  must its closing `</Waypoint>`. There is no inline tag form — that mechanism was
  removed with `<Chip>`.
- **PascalCase is canonical, kebab-case is accepted.** `<EntityDesigner>` and
  `<entity-designer>` are the same tag.
- **Children are constrained per tag**: `none` (any content is an error), `raw`
  (verbatim, never markdown-parsed — this is how `<Genome>` holds real mnemonics),
  `prose` (markdown, no child tags), or an explicit list of allowed child tags.
- **`parents` means only-inside.** `<Waypoint>` outside a `<Scrolly>` is an error.
- **Attribute values are declarative only.** Anything that looks like executable code is
  rejected (`executable-content`).
- **An unknown tag degrades to prose** — its angle brackets render as visible text. So
  a typo'd tag name is a silent visual bug in the app; `doclint check` flags it.
- **A retired tag gets a diagnostic naming its replacement.** `RETIRED_TAGS` currently
  holds `<Chip>`.

## Frontmatter per document kind

Required keys are `REQUIRED_FRONTMATTER` in `doclang.ts`; the codegen in
`scripts/gen-bindings.ts` requires more, and the corpus test requires more again for
lessons. The union of what you actually need:

### `docs/bible/opcodes/<mnemonic>.md`

```yaml
mnemonic: mal          # MUST equal the filename
name: make-space       # the friendly display name — ONE word (letters, digits, hyphens)
emoji: 🏗️              # the chip glyph; the Bible is the source of it
category: control      # action | register | marker | control | value
reads: [C]             # documentation fields, free-form but keep them accurate
writes: [A]
flags_set: [E]
takes_target: false
bytes: 1
can_error: true        # the page renders a "can raise E" pill from this
```

`name` must be unique across all opcodes and must never collide with another
mnemonic — the gene↔mnemonic mapping has to stay a bijection, and `gen-bindings` fails
the build if it does not.

### `docs/bible/concepts/<slug>.md`

```yaml
slug: soup                    # MUST equal the filename
title: soup (the shared memory)   # MUST read "<slug> (a short gloss)"
emoji: 🌊
category: concept             # action | register | marker | control | value | concept
```

The `title` shape is load-bearing in two places, not a style choice:
`gen-bindings.ts` takes the chip's name as `title.split(' (')[0]`, and the Bible index
takes its gloss from the parenthetical. Write the gloss as a **noun phrase, lower case,
no final period** — it appears on an index card, not as a sentence.

Pick `category` for what the concept is *about*, so a concept chip reads in the colour
of the thing it names: `save-pile` is register-coloured, `flags` is value-coloured,
`reading-head` is control-coloured. `concept` is the fallback for ideas that aren't
about one machine part.

### `docs/lessons/<NN>-<id>.md`

```yaml
id: count-up           # MUST equal the filename with its numeric prefix stripped
no: "1"                # MUST match document order across the folder — a string
title: Count up
phase: change          # read | change | daughter | life | evolve | versus
lede: The simplest thing a creature can do: add one to a notebook.
ready: true            # false = a stub; the map shows it as coming soon
requires: [meet]       # the previous lesson id — an unbroken chain, first has none
soup: 256              # optional: world size for this lesson's stages
```

`lede` is **plain text** — it is printed as a string, so no tokens and no markdown.
Quote it if it contains a colon.

The corpus test enforces that `no` matches folder order and that `requires` forms one
unbroken chain, because the map gates chapters linearly and a gap would strand a learner.

## MiniMark — the markdown subset

`packages/app/src/doc/MiniMark.tsx`. Deliberately not a markdown library: the pure
packages take no dependencies, and the inline grammar is not standard markdown anyway.

**Supported blocks:** ATX headings (`#`–`######`), paragraphs, `-`/`*` and `1.` lists
(with two-space continuation lines), fenced code, `>` blockquotes, `---` rules, and GFM
pipe tables.

**Supported inline:** `**strong**`, `*em*`, `` `code` ``, `[text](link)`, and `{token}`.

**Not supported:** setext headings, reference links, images, footnotes, HTML (an unknown
tag renders as visible text), nested lists.

### Tables

A header row, a delimiter row, then body rows. The **delimiter row is what makes it a
table** — a pipe in ordinary prose stays prose — and its column count must match the
header's, or the whole thing renders as a run-on paragraph of pipes.

```markdown
| Reg | Role | Binds |
|-----|:----:|------:|
| {register-a} | address pointer | {incA} |
```

`:--` left, `:-:` centre, `--:` right. Cells go through the same inline scanner as
prose, so a `{token}` in a cell is a chip. Cells are indexed off the header, so a short
row is padded and an over-long one is clipped. Pipes inside a `` `code span` `` are not
cell boundaries — which matters here, because the Bible writes
`` `reg[A] = (reg[A] + 1) | 0` `` throughout.

A wide table scrolls inside its own container; the page never scrolls sideways. Keep
tables to three or four columns anyway — this corpus is read on phones.

### Links

Bible pages cross-link with **relative paths**, which resolve to app routes through the
normal router:

```markdown
[mal](mal.md)                        another opcode page
[soup](../concepts/soup.md)          a concept page, from an opcode page
[template](template.md)              a concept page, from a concept page
```

`doclint check` flags a link that points at no page. Keep `## See also` as links, not
chips — it is the reference's navigation.
