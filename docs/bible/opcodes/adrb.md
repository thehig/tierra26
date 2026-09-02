---
mnemonic: adrb
name: find-back
emoji: 🔎
category: control
reads: []
writes: [A, C]
flags_set: [E]
takes_target: true
bytes: 1 + template
can_error: true
---

# find-back · `adrb`

## Simple
Searches **behind** the {reading-head reader} for a matching {template signpost} and reports where it sits (box {register-a}) and how
big it is (box {register-c}).

## Advanced
Identical to `adro` except the search direction is **backward** (direction 2): it only scans
addresses before the current position. On a hit `A := landing address` (just past the matched
target {template}) and `C := template size`; on a miss within the search limit it **raises** {flag-e}. No
{flag-s}/{flag-z} flags. The {reading-head} advances normally afterward.

## Reads / Writes / Flags
- Reads: the {soup} (own {template} + bytes scanned backward).
- Writes: {register-a} and {register-c}, on a hit.
- Flags: {flag-e} on a miss. No {flag-s}/{flag-z}.

## Gotchas
- The {label landmark} must be behind the instruction; a matching pattern ahead is not found.
- Distant {label landmark} or empty {template} → {flag-e}.

## See also
- [adro](adro.md), [adrf](adrf.md), [subCAB](subCAB.md)
- [template](../concepts/template.md), [target](../concepts/target.md)
