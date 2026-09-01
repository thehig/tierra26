---
mnemonic: incC
name: grow-c
emoji: 🌳
category: register
reads: [C]
writes: [C]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# grow-c · `incC`

## Simple
Adds one to the counting box (C) — the counter that loops and sizes lean on the most.

## Advanced
`C := C + 1` (`reg[C] = (reg[C] + 1) | 0`). Reads C, adds one, coerces to 32-bit signed, stores
back into C. S/Z are set from the new value.

## Reads / Writes / Flags
- Reads: **C**.
- Writes: **C**.
- Flags: **S** and **Z** from the new value of C. Does not touch E.

## Gotchas
- Growing the counter when you meant to shrink it sends a loop the wrong way.
- It grows one at a time — reaching a big number takes many steps (or use `shl` to double).

## See also
- [decC](decC.md), [shl](shl.md), [incA](incA.md)
- [register](../concepts/register.md)
