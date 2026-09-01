---
mnemonic: zero
name: clear
category: action
reads: []
writes: [C]
flags_set: [S, Z]
takes_target: false
bytes: 1
can_error: false
---

# clear · `zero`

## Simple
Empties the counting box (C) back to nothing so you can start counting fresh.

## Advanced
`C := 0` (`reg[C] = 0`). Then the flags are set from the value 0: this makes **Z true** and
**S false** every time. It does not read C first — whatever was there is simply discarded.

## Reads / Writes / Flags
- Reads: nothing (the old value of C is not read).
- Writes: **C** (set to 0).
- Flags: **Z** becomes true, **S** becomes false. Does not touch E.

## Gotchas
- Clearing throws away whatever number was in C — save it first if you still need it.
- A handy way to force the Z flag true.

## See also
- [not0](not0.md), [shl](shl.md), [ifz](ifz.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
