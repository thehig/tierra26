---
mnemonic: decC
name: shrink-c
emoji: 🍂
category: register
reads: [C]
writes: [C]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# shrink-c · `decC`

## Simple
Takes one away from the counting box (C). The usual way to count a loop down toward zero.

## Advanced
`C := C - 1` (`reg[C] = (reg[C] - 1) | 0`). Reads C, subtracts one, coerces to 32-bit signed,
stores back into C. S/Z are set from the new value — so pairing `decC` with `ifz` (which checks
C directly) makes a clean countdown loop.

## Reads / Writes / Flags
- Reads: **C**.
- Writes: **C**.
- Flags: **S** and **Z** from the new value of C. Does not touch E.

## Gotchas
- Counting below zero gives −1 (S set), not a wrap to a huge positive — but a loop that tests
  "C == 0" with `ifz` will sail past zero and keep running if it decrements more than expected.
- Forgetting to decrement at all makes the loop never end.

## See also
- [incC](incC.md), [ifz](ifz.md), [incA](incA.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
