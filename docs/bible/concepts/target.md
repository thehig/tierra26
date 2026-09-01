---
slug: target
title: target (how a control op addresses a place)
---

# target

## Simple
A target is the place a jump, call, or find is aiming for. You do not give it an address number —
you write a little pattern of signposts right after the instruction, and the machine goes looking
for the matching (mirror-image) pattern nearby. Whatever it finds is the target.

## Advanced
Six opcodes **take a target**: `jmpo`, `jmpb`, `call`, `adro`, `adrb`, `adrf`. Each is one opcode
byte followed by a **template** — a run of `nop0`/`nop1` bytes (measured up to length 10). During
decode the machine measures that template and advances its reading head past it. The handler then
calls the template search, which scans the soup for the **bitwise complement** of the template:

- a match is found only where every byte is the flip of the corresponding template byte
  (`source + target == NopS == 1`);
- the **direction** is fixed by the opcode: outward for `jmpo`/`call`/`adro`, backward for
  `jmpb`/`adrb`, forward for `adrf`;
- the scan is bounded by `searchLimit` (proportional to the average creature size);
- the **landing address** is the byte just past the matched target template.

`mal` and `divide` are control verbs but take **no** target — `mal` reads its size from register C
and `divide` reads the daughter state.

On a hit: jumps/calls move the reading head there (call also pushes a return address); finds report
the address into A and the size into C. On a miss within the limit: the **E flag** is raised.

## See also
- [template](template.md), [label](label.md), [reading-head](reading-head.md)
- [jmpo](../opcodes/jmpo.md), [adro](../opcodes/adro.md)
