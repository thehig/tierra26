# Page shapes

Each document kind has a fixed shape. The shape is not decoration: the app slices
documents by heading, so a missing or renamed section silently empties a surface.

## How a page gets sliced

`tooltipMarkdown` (in `packages/app/src/doc/docs.ts`) asks for the **`## Simple`**
section in simple mode and **`## Advanced`** in advanced mode, falling back to whatever
sits above the `<Fold/>` (or above the first tag) if neither exists. `sectionOf` reads
from the heading to the next heading of the same or shallower depth.

So:

- `## Simple` is the **hover card** every chip for that page opens, everywhere in the app.
- The **first sentence of `## Simple`** is also the page's **Bible index gloss** (unless
  the page's `title` has a parenthetical). Write it to stand alone.
- `## Advanced` is the hover card in advanced mode, and the reference body.
- The whole document is the page at `/bible/<mnemonic>` or `/concept/<slug>`.

## An opcode page — `docs/bible/opcodes/<mnemonic>.md`

> Template: `.claude\skills\tierra-docs\templates\opcode.md`

```markdown
---
mnemonic: mal
name: make-space
emoji: 🏗️
category: control
reads: [C]
writes: [A]
flags_set: [E]
takes_target: false
bytes: 1
can_error: true
---

# make-space · `mal`

## Simple
Two or three sentences, kid voice. First sentence stands alone as the index gloss.

## Advanced
The precise behaviour: what it reads, what it writes, the order of checks, what it
does on failure. `code` for engine identifiers and expressions.

## Reads / Writes / Flags
- Reads: {register-c} (requested size).
- Writes: {register-a} (daughter start address) on success; sets the creature's {daughter} block.
- Flags: {flag-e} if size is out of range, exceeds 3× the mother, or no room can be found. No {flag-s}/{flag-z}.

## Edge Cases
- One bullet per boundary the engine actually has, and the wrong model it creates.

## See also
- [movii](movii.md), [divide](divide.md)
- [daughter](../concepts/daughter.md), [gates](../concepts/gates.md)
```

The `# make-space · \`mal\`` heading is skipped by the renderer (the page has already
drawn a styled, language-mode-aware title), but keep it: it is what the file reads as on
disk and in the repo browser.

**All five `##` sections are required.** `Reads / Writes / Flags` is exactly that
spelling, spaces included.

A sixth, **optional** `## Watch it` may sit between `Edge Cases` and `See also`, holding an
`<EntityDesigner>` — a Bible page renders the whole document body, so a live stage works
here exactly as it does in a lesson. Add it when the instruction is a *motion* (a head
jumping, a pointer walking, a daughter filling); skip it when the instruction is a fact.
It is deliberately not called `Try it`: the opcode page already appends its own
`<h3>Try it</h3>` from `INSTRPAGE` after the document body. See
`templates/README.md` for that decision.

Section-by-section intent:

- **Simple** — what it does, in the world the lessons have built ("box A", "the counting
  box (C)", "the world", "a baby"). No engine identifiers. Never say "register 0".
- **Advanced** — engine-exact. Give the assignment (`A := A + 1`), the coercion, the
  order of gates, and what happens on each failure. Bold the load-bearing words.
- **Reads / Writes / Flags** — the three bullets, always in that order, always naming
  registers and flags as tokens. If it sets no flags say so explicitly ("Flags: none")
  rather than omitting the bullet.
- **Edge Cases** — the boundaries and the wrong models they create: a silent
  ring-buffer overwrite, a 70% threshold that still births a partial creature, an `E`
  flag cleared by a `nop` that does not undo the reaper's count. Where a boundary can be
  *shown*, aim `## Watch it` at it rather than describing it.
- **See also** — two lines by convention: sibling opcodes first, then concepts. Links,
  not chips.

## A concept page — `docs/bible/concepts/<slug>.md`

> Template: > Template: `.claude\skills\tierra-docs\templates\concept.md`

```markdown
---
slug: soup
title: soup (the shared memory)
emoji: 🌊
category: concept
---

# soup

## Simple
Kid voice, three or four sentences. This is the hover card for every {soup} chip.

## Advanced
The precise model, with engine identifiers and the constants that matter.

## See also
- [daughter](daughter.md), [gates](gates.md)
- [mal](../opcodes/mal.md)
```

`Reads / Writes / Flags` and `Edge Cases` are not required here, but add them when the
concept has real boundaries — `gates`, `mutation` and `reaper` all earn an Edge Cases
section.

**A concept page chips its own subject.** "A {label} is a friendly name for a spot in
your code." The card is circular on its own page and that is fine — the reader is
already there, and the chip carries the glyph and colour that make the term recognisable
in every other sentence in the corpus.

## A lesson — `docs/lessons/<NN>-<id>.md`

> Template: `.claude\skills\tierra-docs\templates\lesson.md`

```markdown
---
id: loops
no: "8"
title: Go in circles
phase: change
lede: Send the reading head back to a signpost, and blocks repeat.
ready: true
requires: [landmarks]
---

<Scrolly>
  <Stage>
    <EntityDesigner>
      <Genome>
        top:
        incA
        jmpb top
        zero
      </Genome>
    </EntityDesigner>
  </Stage>

  <Waypoint focus="ip">
  ## The loop

  One idea, two or three sentences.
  </Waypoint>

  <Waypoint focus="registers" at="12">
  ## Watch {register-a} climb

  ...
  </Waypoint>
</Scrolly>

<Challenge>
Add a {jmpb top} line just above {zero} to make a loop, and push notebook {register-a} to 5.
<Starter>
top:
incA
zero
</Starter>
<Goal kind="regAtLeast" reg="A" value="5" label="A reaches 5" />
<Solution budget="60">
top:
incA
jmpb top
zero
</Solution>
</Challenge>
```

Rules that are checked:

- The `<Genome>`, `<Starter>` and `<Solution>` bodies are **raw** — real mnemonics and
  labels, never markdown, never tokens.
- The **starter must not already satisfy the goal**, and the **solution must satisfy it
  within `budget`**. The corpus test compiles and runs both.
- A lesson may only use verbs unlocked by it or by a prerequisite — the curriculum graph
  is checked, so you cannot use `{mal}` before the lesson that introduces it.
- `<Waypoint>` drives the stage: `focus` spotlights a part, `at` parks the demo on a
  tick, `run-until` runs to an event. A waypoint may carry its own `<Genome>`/`<State>`
  to override the stage's while it is the one being read.

Lesson writing conventions:

- **One idea per waypoint**, with a `##` heading that names it. Two or three sentences.
  Each waypoint is a screen.
- **A concept chip goes in the body, not the heading.** Headings are short and a concept
  chip is visually heavy there. A register chip in a heading is fine — it is one letter
  (`## Watch {register-a} climb`).
- **Tag once per waypoint** per term. The next waypoint is a new screen; tag again.
- Keep the emphasis for *ideas* (`a *loop*`, `*two cells*`) and let chips carry the
  named things. Never wrap a chip in emphasis.
