---
slug: reaper
title: reaper (how creatures die)
---

# reaper

## Simple
The reaper is what keeps the world from overflowing: it removes creatures to make room. Creatures
that make errors get pushed toward the front of the line and die sooner; creatures that
successfully make babies get nudged back and live a little longer.

## Advanced
The reaper is a queue where index 0 is the next creature to die. It works with the E flag and the
soup's fullness:

- **Errors move you up.** Every `raiseE` (a failed jump/find, a write-protection violation, a
  failed `mal`/`divide`) increments the creature's `errorCount` and moves it **one place up** the
  reaper queue (toward death).
- **Reproducing moves you down.** A successful `divide` moves the mother **one place down** the
  queue (a reprieve).
- **A full soup triggers reaping.** After each slice, while fullness exceeds `reaperThreshold`,
  the creature at the head of the queue is killed (never the sole survivor). Allocation
  (`mal`/first-fit) will also reap to make room when the soup is otherwise full.

Killing a creature frees its cell (and any reserved daughter block), removes it from the slicer
and reaper queues, and records the death in the genebank and founder census.

Note: the E flag being cleared later (e.g. by executing a `nop`) does **not** reverse the
`errorCount` or the queue move already applied — the reaper consequence is immediate.

## See also
- [flags](flags.md), [daughter](daughter.md), [gates](gates.md)
