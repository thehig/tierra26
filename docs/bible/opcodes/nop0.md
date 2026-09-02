---
mnemonic: nop0
name: mark-0
emoji: 🔵
category: marker
reads: []
writes: []
flags_set: [E, S, Z]
takes_target: false
bytes: 1
can_error: false
---

# mark-0 · `nop0`

## Simple
A {template signpost}. `mark-0` does no work on its own — it just sits in your code as a {label landmark} that
jumps and searches can aim for. A row of `mark-0` and `mark-1` {template signposts} spells out a pattern,
and something that jumps looks for the mirror-image of that pattern to know where to land.

## Advanced
`nop0` is opcode 0 and a no-op for data: it changes no register, no memory, and does not move
the {reading-head} beyond the normal one-step advance. Its *only* runtime effect is that its
handler **clears all three** {flags} (`E := false`, `S := false`, `Z := false`). Its real purpose
is structural: `nop0`/`nop1` are the two "{template} bits" the addressing search reads. A run of
them starting just after an addressing opcode is measured (up to 10 bytes) and matched against
its bitwise complement elsewhere in the {soup}.

## Reads / Writes / Flags
- Reads: nothing.
- Writes: nothing (no {register}, no memory).
- Flags: clears {flag-e}, {flag-s} and {flag-z} (the shared `nop` handler sets all three to false).

## Gotchas
- Two {template signposts} with the same bit-pattern are ambiguous — a search lands on the nearest one.
- {template Signposts} do nothing by themselves; something has to jump to or search for the pattern.
- Because `nop0` clears the {flag-e} flag, dropping one into a hot loop quietly wipes the error flag —
  though it does **not** undo an error already counted against the creature by the {reaper}.
- Two adjacent nop runs merge into one longer {template}. Keep a real instruction between separate
  {label landmarks} (see [template](../concepts/template.md)).

## See also
- [nop1](nop1.md), [jmpo](jmpo.md), [adro](adro.md)
- [template](../concepts/template.md), [label](../concepts/label.md)
