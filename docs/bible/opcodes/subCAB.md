---
mnemonic: subCAB
name: subtract
category: register
reads: [A, B]
writes: [C]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# subtract · `subCAB`

## Simple
Takes box B away from box A and puts the answer in the counting box (C). A common way to measure
a distance, like "how big am I" = end minus start.

## Advanced
`C := A - B` (`reg[C] = (reg[A] - reg[B]) | 0`). The two source values are read from A and B,
subtracted, coerced to 32-bit signed, and stored in C. S/Z are set from the result. (The two
read operands pass through the engine's flaw seam, which is an identity in breed-true mode.)

## Reads / Writes / Flags
- Reads: **A** and **B**.
- Writes: **C**.
- Flags: **S** (result negative) and **Z** (result zero). Does not touch E.

## Gotchas
- The answer lands in C, overwriting whatever was there.
- Subtracting a larger number from a smaller one gives a negative result (S set), not a wrap to
  a huge positive — the value is a signed 32-bit integer.

## See also
- [subAAC](subAAC.md), [adro](adro.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
