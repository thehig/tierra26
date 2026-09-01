---
slug: age
title: age (how long a creature has lived)
emoji: ⏳
category: concept
---

# age

## Simple
Age counts how many ticks a creature has been alive, starting from the moment it
was born. It doesn't make a creature slower or weaker — but when the soup fills
up, older creatures are nearer the front of the queue to be cleared away.

## Advanced
Age is derived, not stored: it is `cycles - bornAtCycle`, so it is measured in
instruction cycles rather than reproductions.

Age is **not** the reaper's ordering key. The reaper keeps its own queue, and a
creature's place in it moves for reasons other than time: raising the E flag
pushes it *up* toward the front, and a successful `divide` nudges its mother
*down* away from it. Living a long time without erroring and without reproducing
still drifts you toward the front simply because everything below you leaves.

## See also
- [reaper](reaper.md), [flags](flags.md), [instruction-cycle](instruction-cycle.md)
- [divide](../opcodes/divide.md)
