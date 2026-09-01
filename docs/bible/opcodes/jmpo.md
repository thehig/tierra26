---
mnemonic: jmpo
name: jump
emoji: ⏩
category: control
reads: []
writes: []
flags_set: [E]
takes_target: true
bytes: 1 + template
can_error: true
---

# jump · `jmpo`

## Simple
Sends the reader to the nearest matching signpost, in either direction. Use it to skip ahead or
to loop. It hunts for the mirror-image of the pattern you write right after it.

## Advanced
`IP := <nearest complementary template, outward>`. After the opcode, the reading head measures its
own template (the run of `nop0`/`nop1` bytes that follows, up to 10). It then searches **outward**
(direction 0: nearest of forward/backward, forward winning ties) for a spot whose bytes are the
bitwise complement of that template. On a hit, `IP` is set to the address **just past** the matched
target template and the normal advance is suppressed. On a miss within the search limit, it
**raises the E flag** instead and the reading head falls through to the next byte.

## Reads / Writes / Flags
- Reads: the soup (its own template plus the bytes it scans).
- Writes: the **reading head** (IP) on a hit.
- Flags: **E** on a miss (no matching complement found within the search limit). Sets no S/Z.

## Gotchas
- The target is the **complement** of your template — flip a bit and the jump lands elsewhere or
  misses.
- A jump with an empty template (no nops after it) always misses and raises E.
- The search only reaches `searchLimit` cells away (proportional to the average creature size); a
  faraway landmark is not found.
- Raising E moves the creature up the reaper's queue (closer to death).

## See also
- [jmpb](jmpb.md), [call](call.md), [adro](adro.md)
- [template](../concepts/template.md), [target](../concepts/target.md), [reading-head](../concepts/reading-head.md)
