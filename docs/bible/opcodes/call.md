---
mnemonic: call
name: call
emoji: 📞
category: control
reads: []
writes: []
flags_set: [E]
takes_target: true
bytes: 1 + template
can_error: true
---

# call · `call`

## Simple
Runs a helper routine and remembers where to come back to. The reader jumps to the matching
signpost, and later a `return` brings it right back to the line after the call.

## Advanced
`push(return address); IP := <nearest complementary template, outward>`. It measures its own
template, computes the **return address** = the byte just past its own opcode+template
(`ad(IP + 1 + templateLen)`), and searches **outward** for the complement. On a hit it **pushes
that return address onto the save-pile**, sets `IP` to just past the matched target template, and
suppresses the normal advance. On a miss within the limit it raises the **E flag** and pushes
nothing.

## Reads / Writes / Flags
- Reads: the soup (own template + scanned bytes).
- Writes: the **save-pile** (the return address) and the **reading head** (IP), both only on a hit.
- Flags: **E** on a miss.

## Gotchas
- What is saved is the **return address** (just after the call's template), not the raw IP value.
- Every `call` needs a matching `ret`; otherwise the saved return address is left on the pile and
  the routine never comes back cleanly.
- Do not disturb the top of the save-pile inside the routine, or `ret` returns to the wrong place.
- On a miss nothing is pushed — a following `ret` then pops an unrelated slot.

## See also
- [ret](ret.md), [jmpo](jmpo.md), [pushA](pushA.md)
- [save-pile](../concepts/save-pile.md), [target](../concepts/target.md)
