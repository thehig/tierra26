---
mnemonic: adrf
name: find-forward
emoji: 🔦
category: control
reads: []
writes: [A, C]
flags_set: [E]
takes_target: true
bytes: 1 + template
can_error: true
---

# find-forward · `adrf`

## Simple
Searches **ahead** of the {reading-head reader} for a matching {template signpost} and reports where it sits (box {register-a}) and
how big it is (box {register-c}). Pairing a backward find with a forward find lets a creature measure its
own size.

## Advanced
Identical to `adro` except the search direction is **forward** (direction 1): it only scans
addresses after the current position. On a hit `A := landing address` (just past the matched
target {template}) and `C := template size`; on a miss within the search limit it **raises** {flag-e}. No
{flag-s}/{flag-z} flags. The {reading-head} advances normally afterward.

## Reads / Writes / Flags
- Reads: the {soup} (own {template} + bytes scanned forward).
- Writes: {register-a} and {register-c}, on a hit.
- Flags: {flag-e} on a miss. No {flag-s}/{flag-z}.

## Gotchas
- The {label landmark} must be ahead; a matching pattern behind is not found.
- Measuring from the wrong {label landmark} gives a size that is too big or too small.
- Distant {label landmark} or empty {template} → {flag-e}.

## See also
- [adro](adro.md), [adrb](adrb.md), [subCAB](subCAB.md)
- [template](../concepts/template.md), [target](../concepts/target.md)
