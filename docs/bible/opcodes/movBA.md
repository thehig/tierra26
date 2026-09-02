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
Copies box {register-a} into box {register-b} so both start with the same number. Handy at the start of a copy loop:
put the start address in A, copy it to B, then walk one pointer while the other stays.

## Advanced
`B := A` (`reg[B] = reg[A] | 0`). Reads {register-a}, writes the value into {register-b} (coerced to 32-bit signed),
and sets {flag-s}/{flag-z} from the value written.

## Reads / Writes / Flags
- Reads: {register-a}.
- Writes: {register-b}.
- Flags: {flag-s} and {flag-z} from the copied value. Does not touch {flag-e}.

## Gotchas
- {register-b} is overwritten — protect its old value first if you still need it.
- The two boxes are independent after the copy.

## See also
- [movDC](movDC.md), [incA](incA.md), [incB](incB.md)
- [register](../concepts/register.md)
