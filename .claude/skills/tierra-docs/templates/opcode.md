---
mnemonic: «mnemonic»
name: «display-name»
emoji: «glyph»
category: «action | register | marker | control | value»
reads: [«C»]
writes: [«A»]
flags_set: [«E»]
takes_target: «true | false»
bytes: «1 | 1 + template»
can_error: «true | false»
---

# «display-name» · `«mnemonic»`

## Simple
«One sentence that stands alone — it is this page's card in the Bible index and the
first line of every hover card.» «One or two more, in the lesson's own words, and tag
every one of them: box {register-a}, the counting box ({register-c}), the {soup world},
a {daughter baby}, a {template signpost}. No engine identifiers.»

## Advanced
«Lead with the operation: `C := A - B` (`reg[C] = (reg[A] - reg[B]) | 0`).» «Then what
it reads, what it writes, the coercion, the order of gates, and what happens on each
failure — including "and does nothing".»

## Reads / Writes / Flags
- Reads: «{register-a} («what it means here»)».
- Writes: «{register-c}» — «or: nothing».
- Flags: «{flag-s} and {flag-z} from the result. Does not touch {flag-e}.» — «or: none».

## Edge Cases
«The boundaries the engine actually has, and the wrong model each one creates. Cover the
zero case, the wrap case, the empty case, and exactly-at-the-threshold.»

- «A silence where a fault is expected — a ring that overwrites, a pop that never raises.»
- «A threshold that still succeeds, and what a reader wrongly concludes from it.»
- «An interaction with another instruction that only bites in combination.»
- «A wrong model a learner predictably brings to this instruction.»

«Where an edge case can be shown rather than described, set `## Try it` up to land on
it — a preset `<State>` that starts one step from the boundary beats a paragraph.»

## Try it
<EntityDesigner soup="36">
  <Genome>
«the smallest genome that shows the behaviour — three or four blocks»
  </Genome>
  <State «a="3" b="1"» />
</EntityDesigner>

«One sentence naming what to watch as it steps.»

## See also
- [«sibling-mnemonic»](«sibling-mnemonic».md), [«sibling-mnemonic»](«sibling-mnemonic».md)
- [«concept-slug»](../concepts/«concept-slug».md), [«concept-slug»](../concepts/«concept-slug».md)
