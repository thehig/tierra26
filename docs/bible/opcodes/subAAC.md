---
mnemonic: subAAC
name: subtract-into-a
category: register
reads: [A, C]
writes: [A]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# subtract-into-a · `subAAC`

## Simple
Takes the counting box (C) away from box A and keeps the answer in A. Handy for stepping an
address backwards by an amount.

## Advanced
`A := A - C` (`reg[A] = (reg[A] - reg[C]) | 0`). Reads A and C, subtracts, coerces to 32-bit
signed, stores back into A. S/Z are set from the result. (Operands pass through the flaw seam,
an identity in breed-true mode.)

## Reads / Writes / Flags
- Reads: **A** and **C**.
- Writes: **A**.
- Flags: **S** and **Z** from the result. Does not touch E.

## Gotchas
- A is overwritten — its old value is gone.
- Subtracting more than A holds yields a negative signed value.

## See also
- [subCAB](subCAB.md), [incA](incA.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
