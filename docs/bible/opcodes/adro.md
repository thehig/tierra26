---
mnemonic: adro
name: find
emoji: 🔍
category: control
reads: []
writes: [A, C]
flags_set: [E]
takes_target: true
bytes: 1 + template
can_error: true
---

# find · `adro`

## Simple
Searches both directions for a matching signpost and reports back where it is (into box A) and
how big the signpost was (into box C). A creature uses this to learn its own address and size.

## Advanced
Searches **outward** (direction 0: nearest of forward/backward, forward winning ties) for the
bitwise complement of its own template. On a hit it writes:
- `A := address` — the landing address, i.e. just **past** the matched target template;
- `C := size` — the length of the matched template (number of nop bytes).

On a miss within the search limit it **raises the E flag** and leaves A and C unchanged. Unlike
the arithmetic ops, a successful `adro` sets **no S/Z flags**. The reading head then advances
normally past the opcode and template (it does not jump).

## Reads / Writes / Flags
- Reads: the soup (own template + scanned bytes).
- Writes: **A** (found address) and **C** (template size), on a hit.
- Flags: **E** on a miss. No S/Z.

## Gotchas
- The address returned in A is just past the found landmark, not the first nop of it.
- Search only reaches `searchLimit` cells; a distant landmark is not found → E.
- Empty template (no nops after the opcode) → miss → E.
- `find` does **not** move the reading head; it only reports (contrast with `jmpo`, which jumps).

## See also
- [adrb](adrb.md), [adrf](adrf.md), [subCAB](subCAB.md), [jmpo](jmpo.md)
- [template](../concepts/template.md), [target](../concepts/target.md)
