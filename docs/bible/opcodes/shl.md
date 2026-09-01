---
mnemonic: shl
name: double
emoji: ✖️
category: action
reads: [C]
writes: [C]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# double · `shl`

## Simple
Doubles the number in the counting box (C) by sliding all its bits up one place. Do it three
times and the number is eight times bigger.

## Advanced
`C := C << 1` (`reg[C] = (reg[C] << 1) | 0`). A single left shift: the low bit becomes 0 and
every other bit moves up one. The `| 0` coerces to 32-bit signed, so a value large enough to
push a 1 into bit 31 becomes **negative**, which sets the S flag. S/Z are set from the result.

## Reads / Writes / Flags
- Reads: **C**.
- Writes: **C**.
- Flags: **S** and **Z** from the new value of C. Does not touch E.

## Gotchas
- Doubling grows a number fast; repeated shifts can overflow into a negative value (S set).
- Doubling zero leaves zero.

## See also
- [not0](not0.md), [zero](zero.md), [incC](incC.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
