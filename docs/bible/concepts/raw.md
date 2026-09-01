---
slug: raw
title: raw (writing a bare opcode)
emoji: 🧱
category: concept
---

# raw

## Simple
`raw` lets you drop a single instruction into your code by its exact machine name, instead of its
friendly word. It is the "escape hatch" for when you want a precise opcode, or when you are
studying an evolved creature and the disassembler shows you a byte it cannot dress up as a
friendly verb.

## Advanced
In GeneScript a `raw <mnemonic>` line emits exactly one opcode byte for that mnemonic, resolved
through the active instruction set (never a hard-coded number). The disassembler emits `raw`
forms as its never-fail floor:
- `raw <mnemonic>` — a known opcode shown in raw form, e.g. a target-taking control opcode whose
  template could not be paired into a clean label, or an addressing opcode with a dangling/merged
  template run;
- `raw nop0` / `raw nop1` — the individual nop bytes of a template run that failed to pair;
- `raw byte <n>` — a byte whose value is out of range for the active set (a mutated/garbage byte),
  preserved literally so the round-trip is faithful.

Because `raw <mnemonic>` writes just the opcode with no template, it is how a target-taking verb
is exercised without authoring a landmark for it.

## See also
- [target](target.md), [label](label.md), [template](template.md)
