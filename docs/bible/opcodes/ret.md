---
mnemonic: ret
name: return
emoji: 🔙
category: control
reads: []
writes: []
flags_set: []
takes_target: false
bytes: 1
can_error: false
---

# return · `ret`

## Simple
Goes back to wherever a `call` started from and carries on there. It takes the remembered spot
off the save-pile and jumps to it.

## Advanced
`IP := pop()` (wrapped to the soup: `IP = ad(pop())`). It pops one value off the ring stack and
sets the reading head to that address, suppressing the normal advance. It sets no flags and, notably,
**never raises E** — even with an empty pile it simply pops a stale slot and jumps there.

## Reads / Writes / Flags
- Reads: the **save-pile**.
- Writes: the **reading head** (IP).
- Flags: none.

## Gotchas
- `ret` only works if a `call` (or a matching `push`) put a real return address on the pile
  first. With an empty/mismatched pile it jumps to a **stale or garbage address** with no error —
  a silent runaway rather than a fault.
- Disturbing the save-pile inside a routine sends the return to the wrong place.

## See also
- [call](call.md), [popA](popA.md)
- [save-pile](../concepts/save-pile.md), [reading-head](../concepts/reading-head.md)
