# Voice: Simple without dilution, Advanced without drift

The audience is **8–16 year olds** learning a real virtual machine on a formidable,
authentic-Tierra engine. Both halves of that matter. A page that is friendly but wrong
teaches something that has to be unlearned; a page that is exact but unreadable teaches
nothing.

## The one test for a Simple section

> **A Simple sentence must still be TRUE when the reader gets to Advanced.**

Simplify by *leaving things out*, never by saying something almost-right. This is the
difference between simplifying and diluting.

| ✗ Diluted (becomes false) | ✓ Simple (stays true) |
|---|---|
| "`divide` makes a copy of the creature." | "`divide` sets the finished baby free as its own creature." |
| "`ifz` runs the block if C is zero." | "`ifz` lets the *next* block run only when C is zero — otherwise it skips it." |
| "The save-pile holds your numbers." | "The save-pile is a small stack of hidden slots… It has room for ten things." |
| "`mal` gets memory." | "`mal` asks the world for empty room to build a baby, then points box A at the start of that room." |

The second column omits mechanism. It never misstates it.

Two corollaries:

- **Say the limit if the limit will bite.** "It has room for ten things" belongs in
  Simple, because an 11th push silently overwrites and the learner will hit it.
- **Don't promise symmetry that isn't there.** `not0` flips *the lowest bit*, not "the
  number". A kid who reads "flips the number" will predict `-1`.

## Writing Simple

- **Concrete and physical.** Boxes, rooms, signposts, a reading head that walks. The
  machine is a place.
- **Second person for lessons, third for the Bible.** A lesson says "your creature";
  a Bible page says "a creature".
- **No engine identifiers.** No `reg[2]`, no `dauStart`, no "index 0". Those are
  Advanced's job.
- **Use the project's own words, and use them consistently** — they are what the chips
  render, so a wrong synonym reads as a different object. Run `doclint vocab`; the
  current set is:

  | The thing | The word | Token |
  |---|---|---|
  | a register | box, notebook | `{register-a}`, `{register boxes}` |
  | register C specifically | the counting box (C) | `{register-c}` |
  | register D | the spare box (D) | `{register-d}` |
  | the instruction pointer | the reading head, the reader | `{reading-head}` |
  | a nop template | a signpost | `{template signpost}` |
  | a named landmark | a landmark | `{label landmark}` |
  | the soup | the world | `{soup world}` |
  | the daughter | a baby | `{daughter baby}` |
  | the stack | the save-pile, the pile | `{save-pile}` |
  | one cycle | a tick | `{instruction-cycle tick}` |

- **Two to four sentences.** The first one stands alone (it becomes the index gloss).
- **Kid tone, not baby tone.** No "Yay!", no exclamation marks in the Bible, no
  "super-duper". These readers are learning assembly; respect that.

## Writing Advanced

- **Engine-exact, and derived from the engine source** — see `references/fidelity.md`.
- **Lead with the operation.** `` `C := A - B` (`reg[C] = (reg[A] - reg[B]) | 0`) `` then
  prose. The assignment form is the fastest true thing you can say.
- **Name the constants.** `MAX_TEMPLATE = 10`, `STACK_SIZE = 10`, `movThrScaled`
  defaults to **700 per-1000 (70%)**. A number without its name cannot be checked.
- **State the order of checks**, numbered, when there is more than one gate — and what
  happens on each failure, including "and does nothing".
- **Say what it does NOT do.** "It sets no flags." "`ifz` checks the register value
  directly; it does not read the Z flag." "`ret` never raises E." Negative facts are
  where readers' models go wrong.
- **Bold the load-bearing word**, not the whole clause — and never around a chip.

## Edge Cases are a design surface, not a leftover

A good Edge Cases bullet is one of:

1. **A learner's predictable wrong model.** "It guards exactly **one** instruction, not
   a block."
2. **Silence where you'd expect a fault.** "The pile is a 10-slot ring with **no
   overflow fault** — an 11th push silently overwrites the oldest saved value."
3. **A threshold with a surprising consequence.** "Between 70% and 100% written, it
   **does** release the daughter, so a not-quite-finished copy is born as a
   broken/partial creature."
4. **An interaction with another opcode.** "`divide` with no prior `mal` raises E."

Not an edge case: a restatement of Advanced, or a warning about something the engine
prevents anyway.

Where a boundary can be demonstrated, aim the `## Try it` stage at it — a preset
`<State>` one step from the threshold teaches it in a way a sentence cannot.

## Examples

An example earns its place by being **runnable and minimal**. In the Bible, a `<Genome>`
inside an `<EntityDesigner>` beats three sentences of description — the reader can step
it. Prefer:

- the **smallest** genome that shows the behaviour (three or four blocks);
- one that shows the **failure** as well as the success, where the failure is the
  interesting half (an empty template → miss → `{flag-e}`);
- `<State>` to set up the interesting case directly rather than a preamble of `incA`s.

The boundaries worth covering, in Advanced or in `## Edge Cases`: the zero case, the
wrap case (the soup is circular; a signed 32-bit register goes negative), the empty case
(a zero-length template finds nothing), the boundary (exactly at the threshold), and the
already-in-that-state case (`mal` when a daughter already exists frees the old one).

## Visual explainers

A stage earns its place when the thing being taught is a **change over time** or a
**position in space** — the reading head moving, a daughter filling, a template search
walking outward. It does not earn its place for a fact.

- A `<Scrolly>` with a sticky `<Stage>` and several `<Waypoint>`s is the tool for "watch
  this happen" — one idea per waypoint, `focus` to spotlight the part under discussion,
  `at`/`run-until` to advance the demo.
- `<EntityDesigner>` alone is the tool for "here is one, look at it".
- A table is the tool for a fixed mapping (see `register.md`) — never for a narrative.
- Emoji glyphs come from frontmatter and are already carried by every chip; don't
  restate them in prose.

If a page cannot be understood without a diagram this corpus cannot draw, that is a
signal the prose is doing too much at once — split the idea across waypoints.
