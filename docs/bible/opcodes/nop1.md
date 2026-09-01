---
mnemonic: nop1
name: mark-1
category: marker
reads: []
writes: []
flags_set: [E, S, Z]
takes_target: false
bytes: 1
can_error: false
---

# mark-1 · `nop1`

## Simple
The other kind of signpost. `mark-1` is the opposite bit to `mark-0`. You spell a landmark by
mixing `mark-0` and `mark-1`, and a jump looks for the *opposite* pattern (every `mark-0`
matched by a `mark-1` and the other way round) to find where to land.

## Advanced
`nop1` is opcode 1 and, like `nop0`, is a data no-op that only **clears all three flags**
(`E`, `S`, `Z`) when executed. It is the "1" template bit. In the complement match used by
the search, `nop0` (0) pairs with `nop1` (1): a target byte matches a source byte only when the
two sum to `NopS = nop0 + nop1 = 1`, i.e. each target bit is the flip of the source bit.

## Reads / Writes / Flags
- Reads: nothing.
- Writes: nothing.
- Flags: clears **E**, **S** and **Z**.

## Gotchas
- Flipping one bit of a landmark (a `mark-0`↔`mark-1` change) changes the pattern a jump aims
  for, so the matching jump will miss or land elsewhere.
- Adjacent landmarks blur into one longer template; separate them with a real instruction.
- Executing `nop1` clears the E flag but does not reverse an error already recorded.

## See also
- [nop0](nop0.md), [jmpo](jmpo.md), [adro](adro.md)
- [template](../concepts/template.md), [label](../concepts/label.md)
