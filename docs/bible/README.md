# THE BIBLE — tierra26 instruction-set reference

This is the 100%-engine-accurate reference for the tierra26 virtual machine's classic-32
instruction set. Every claim here is derived from the **engine source**, not from prose docs.

Ground-truth sources this was checked against:

- `packages/engine/src/isa.ts` — the dictionary (id, mnemonic, gene, kind, exec, dir, binding).
- `packages/engine/src/handlers.ts` — the 32 execute handlers (what each reads/writes/faults).
- `packages/engine/src/world.ts` — `stepOne` (decode + template measurement), the mal/divide/copy
  gates, the reaper/error consequences.
- `packages/engine/src/cpu.ts` — registers A–D, flags E/S/Z, the 10-slot ring stack, IP.
- `packages/engine/src/soup.ts` — circular addressing and write protection.
- `packages/engine/src/template.ts` — complementary nop-template search.

## How this is organised

- **`opcodes/<mnemonic>.md`** — one page per opcode. YAML frontmatter (the machine facts) plus a
  **Simple** (kid-level) and **Advanced** (precise) explanation, exact reads/writes/flags, and
  engine-accurate gotchas.
- **`concepts/<slug>.md`** — the ideas the opcodes lean on: registers, the save-pile, the reading
  head, flags, templates, the soup, the daughter, and more.

## The register conventions

The engine gives every creature four numeric registers, `A B C D` (indices 0–3). Nothing forces a
role, but the classic-32 bindings use them by convention:

| Reg | Index | Conventional role |
|-----|-------|-------------------|
| A | 0 | **address** — daughter start (`mal`), search result (`adr*`), copy *destination* pointer (`movii`) |
| B | 1 | **second pointer** — copy *source* pointer (`movii`) |
| C | 2 | **counter / size** — the scratch register: `not0/shl/zero/ifz/decC/incC` all act on C; `adr*` returns size in C; `mal` reads size from C |
| D | 3 | **spare** — parked/restored via `movDC`, `pushD`, `popD` |

## The 32 opcodes

| Mnemonic | Gene (friendly) | Category | Target? | Can error? | Page |
|----------|-----------------|----------|---------|-----------|------|
| `nop0` | mark-0 | marker | no | no | [nop0](opcodes/nop0.md) |
| `nop1` | mark-1 | marker | no | no | [nop1](opcodes/nop1.md) |
| `not0` | flip-bit | action | no | no | [not0](opcodes/not0.md) |
| `shl` | double | action | no | no | [shl](opcodes/shl.md) |
| `zero` | clear | action | no | no | [zero](opcodes/zero.md) |
| `ifz` | if-zero | control | no | no | [ifz](opcodes/ifz.md) |
| `subCAB` | subtract | register | no | no | [subCAB](opcodes/subCAB.md) |
| `subAAC` | subtract-into-a | register | no | no | [subAAC](opcodes/subAAC.md) |
| `incA` | grow-a | register | no | no | [incA](opcodes/incA.md) |
| `incB` | grow-b | register | no | no | [incB](opcodes/incB.md) |
| `decC` | shrink-c | register | no | no | [decC](opcodes/decC.md) |
| `incC` | grow-c | register | no | no | [incC](opcodes/incC.md) |
| `pushA` | save-a | register | no | no | [pushA](opcodes/pushA.md) |
| `pushB` | save-b | register | no | no | [pushB](opcodes/pushB.md) |
| `pushC` | save-c | register | no | no | [pushC](opcodes/pushC.md) |
| `pushD` | save-d | register | no | no | [pushD](opcodes/pushD.md) |
| `popA` | load-a | register | no | no | [popA](opcodes/popA.md) |
| `popB` | load-b | register | no | no | [popB](opcodes/popB.md) |
| `popC` | load-c | register | no | no | [popC](opcodes/popC.md) |
| `popD` | load-d | register | no | no | [popD](opcodes/popD.md) |
| `jmpo` | jump | control | yes | yes | [jmpo](opcodes/jmpo.md) |
| `jmpb` | jump-back | control | yes | yes | [jmpb](opcodes/jmpb.md) |
| `call` | call | control | yes | yes | [call](opcodes/call.md) |
| `ret` | return | control | no | no | [ret](opcodes/ret.md) |
| `movDC` | copy-c-to-d | register | no | no | [movDC](opcodes/movDC.md) |
| `movBA` | copy-a-to-b | register | no | no | [movBA](opcodes/movBA.md) |
| `movii` | copy-byte | action | no | yes | [movii](opcodes/movii.md) |
| `adro` | find | control | yes | yes | [adro](opcodes/adro.md) |
| `adrb` | find-back | control | yes | yes | [adrb](opcodes/adrb.md) |
| `adrf` | find-forward | control | yes | yes | [adrf](opcodes/adrf.md) |
| `mal` | make-space | control | no | yes | [mal](opcodes/mal.md) |
| `divide` | divide | control | no | yes | [divide](opcodes/divide.md) |

## The concepts

- [raw](concepts/raw.md) — writing a bare opcode by name
- [target](concepts/target.md) — how a control op addresses a place
- [label](concepts/label.md) — friendly names for template landmarks
- [template](concepts/template.md) — nop runs, complement, search direction
- [register](concepts/register.md) — A/B/C/D and their roles
- [save-pile](concepts/save-pile.md) — the stack (LIFO ring, depth 10)
- [reading-head](concepts/reading-head.md) — the instruction pointer (IP)
- [flags](concepts/flags.md) — E / S / Z, what sets each
- [soup](concepts/soup.md) — the circular memory and write protection
- [daughter](concepts/daughter.md) — allocation, copying, and birth
- [gates](concepts/gates.md) — the size and write-threshold checks on `mal`/`divide`
- [reaper](concepts/reaper.md) — how the E flag and a full soup kill creatures
- [mutation](concepts/mutation.md) — the copy-flaw and flaw seams
- [instruction-cycle](concepts/instruction-cycle.md) — fetch, decode, execute, advance
