---
mnemonic: divide
name: divide
emoji: 👶
category: control
reads: []
writes: []
flags_set: [E]
takes_target: false
bytes: 1
can_error: true
---

# divide · `divide`

## Simple
Splits the finished {daughter baby} off from the mother so it becomes its own new creature. You have to
build enough of the baby first, or the split is refused.

## Advanced
Releases the allocated {daughter} as a new independent creature. It first checks the **divide** {gates gate}:
- there must be an allocated {daughter} (`dauStart >= 0`), and
- enough of it must have been written: `dauWritten × 1000 >= dauSize × movThrScaled`, where
  `movThrScaled` defaults to **700 per-1000 (70%)**.

If either check fails it **raises** {flag-e} and no birth happens. Otherwise it births the {daughter}:
the daughter block becomes a new creature (registered, enqueued in the slicer and {reaper}), the
mother's daughter fields are cleared, births increment, and the mother is nudged **down** the
reaper queue (a small reward for reproducing). The mother keeps running; its {reading-head}
advances normally past the `divide`.

## Reads / Writes / Flags
- Reads: the {daughter}'s allocation state and write-tally.
- Writes: creates a new creature; clears the mother's {daughter} block; moves the mother down the
  {reaper} queue.
- Flags: {flag-e} if there is no {daughter} or it is under the write threshold. No {flag-s}/{flag-z}.

## Gotchas
- Under the 70% threshold, `divide` **fails with** {flag-e} — it does not release a partial {daughter baby}.
- Between 70% and 100% written, it **does** release the {daughter}, so a not-quite-finished copy is
  born as a broken/partial creature. Copy the whole thing before dividing.
- `divide` with no prior `mal` raises {flag-e}.

## See also
- [mal](mal.md), [movii](movii.md)
- [daughter](../concepts/daughter.md), [gates](../concepts/gates.md), [reaper](../concepts/reaper.md)
