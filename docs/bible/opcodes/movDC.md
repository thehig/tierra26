---
mnemonic: movDC
name: copy-c-to-d
emoji: 🔃
category: register
reads: [C]
writes: [D]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# copy-c-to-d · `movDC`

## Simple
Copies the counting box (C) into the spare box (D) so both hold the same number. C is left as it
was.

## Advanced
`D := C` (`reg[D] = reg[C] | 0`). Reads C, writes the value into D (coerced to 32-bit signed), and
sets S/Z from the value written.

## Reads / Writes / Flags
- Reads: **C**.
- Writes: **D**.
- Flags: **S** and **Z** from the copied value. Does not touch E.

## Gotchas
- The copy overwrites D — its old value is lost.
- The two boxes are separate afterward: changing C does not change D.

## See also
- [movBA](movBA.md), [pushD](pushD.md)
- [register](../concepts/register.md)
