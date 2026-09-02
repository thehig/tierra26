---
mnemonic: jmpb
name: jump-back
emoji: ⏪
category: control
reads: []
writes: []
flags_set: [E]
takes_target: true
bytes: 1 + template
can_error: true
---

# jump-back · `jmpb`

## Simple
Jumps to a matching {template signpost} **behind** the {reading-head reader} — the usual way to loop back and repeat.

## Advanced
`IP := <nearest complementary template, backward>`. Identical to `jmpo` except the search
direction is **backward** (direction 2): it only looks at addresses before the current position.
On a hit, `IP` is set to just past the matched target {template} and the normal advance is
suppressed; on a miss within the search limit it raises the {flag-e} flag.

## Reads / Writes / Flags
- Reads: the {soup} (its own {template} plus the bytes it scans backward).
- Writes: the {reading-head} (IP) on a hit.
- Flags: {flag-e} on a miss.

## Gotchas
- The {label landmark} must be **behind** the jump. A matching pattern that sits ahead is not found.
- A loop with no exit condition (e.g. no `ifz`/`decC` guard) repeats forever.
- Empty {template} or out-of-range {label landmark} → miss → {flag-e}.

## See also
- [jmpo](jmpo.md), [ifz](ifz.md), [decC](decC.md)
- [template](../concepts/template.md), [target](../concepts/target.md)
