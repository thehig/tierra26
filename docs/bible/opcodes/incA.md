---
mnemonic: incA
name: grow-a
emoji: 🌱
category: register
reads: [A]
writes: [A]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# grow-a · `incA`

## Simple
Adds one to box A. Because A usually points at an address, this nudges that pointer along by one
spot — the way a copy loop walks to the next byte.

## Advanced
`A := A + 1` (`reg[A] = (reg[A] + 1) | 0`). Reads A, adds one, coerces to 32-bit signed, stores
back into A. S/Z are set from the new value.

## Reads / Writes / Flags
- Reads: **A**.
- Writes: **A**.
- Flags: **S** and **Z** from the new value of A. Does not touch E.

## Gotchas
- Adds one *unit* (one byte/address), not a whole line.
- Forgetting to step A forward makes a copy loop keep hammering the same address.

## See also
- [incB](incB.md), [incC](incC.md), [decC](decC.md), [movii](movii.md)
- [register](../concepts/register.md)
