---
mnemonic: zero
name: clear
emoji: 🧹
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
Empties the counting box ({register-c}) back to nothing so you can start counting fresh.

## Advanced
`C := 0` (`reg[C] = 0`). Then the flags are set from the value 0: this makes {flag-z} true and
{flag-s} false every time. It does not read {register-c} first — whatever was there is simply discarded.

## Reads / Writes / Flags
- Reads: nothing (the old value of {register-c} is not read).
- Writes: {register-c} (set to 0).
- Flags: {flag-z} becomes true, {flag-s} becomes false. Does not touch {flag-e}.

## Gotchas
- Clearing throws away whatever number was in {register-c} — save it first if you still need it.
- A handy way to force the {flag-z} flag true.

## See also
- [not0](not0.md), [shl](shl.md), [ifz](ifz.md)
- [register](../concepts/register.md), [flags](../concepts/flags.md)
