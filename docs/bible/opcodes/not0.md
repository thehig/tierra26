---
mnemonic: not0
name: flip-bit
category: action
reads: [C]
writes: [C]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# flip-bit · `not0`

## Simple
Flips the smallest bit of the counting box (C). An even number becomes odd, and an odd number
becomes even. Do it twice and you are right back where you started.

## Advanced
`C := C XOR 1` (`reg[C] = (reg[C] ^ 1) | 0`). Toggles bit 0 of register C only; all other bits
are untouched. The result is coerced to a 32-bit signed integer, then the S/Z flags are set from
it.

## Reads / Writes / Flags
- Reads: **C**.
- Writes: **C**.
- Flags: **S** (result negative) and **Z** (result zero) from the new value of C. Does not touch E.

## Gotchas
- It flips only the lowest bit — it does not negate or invert the whole number.
- Applying it an even number of times is a no-op.

## See also
- [shl](shl.md), [zero](zero.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
