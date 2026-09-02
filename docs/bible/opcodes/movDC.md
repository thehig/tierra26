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
Copies the counting box ({register-c}) into the spare box ({register-d}) so both hold the same number. C is left as it
was.

## Advanced
`D := C` (`reg[D] = reg[C] | 0`). Reads {register-c}, writes the value into {register-d} (coerced to 32-bit signed), and
sets {flag-s}/{flag-z} from the value written.

## Reads / Writes / Flags
- Reads: {register-c}.
- Writes: {register-d}.
- Flags: {flag-s} and {flag-z} from the copied value. Does not touch {flag-e}.

## Gotchas
- The copy overwrites {register-d} — its old value is lost.
- The two boxes are separate afterward: changing {register-c} does not change {register-d}.

## See also
- [movBA](movBA.md), [pushD](pushD.md)
- [register](../concepts/register.md)
