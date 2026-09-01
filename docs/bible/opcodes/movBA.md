---
mnemonic: movBA
name: copy-a-to-b
emoji: 🔄
category: register
reads: [A]
writes: [B]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# copy-a-to-b · `movBA`

## Simple
Copies box A into box B so both start with the same number. Handy at the start of a copy loop:
put the start address in A, copy it to B, then walk one pointer while the other stays.

## Advanced
`B := A` (`reg[B] = reg[A] | 0`). Reads A, writes the value into B (coerced to 32-bit signed),
and sets S/Z from the value written.

## Reads / Writes / Flags
- Reads: **A**.
- Writes: **B**.
- Flags: **S** and **Z** from the copied value. Does not touch E.

## Gotchas
- B is overwritten — protect its old value first if you still need it.
- The two boxes are independent after the copy.

## See also
- [movDC](movDC.md), [incA](incA.md), [incB](incB.md)
- [register](../concepts/register.md)
