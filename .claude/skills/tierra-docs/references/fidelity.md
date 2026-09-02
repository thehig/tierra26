# Fidelity: which source is authoritative for what

The Bible's own README states the standard: *"Every claim here is derived from the
engine source, not from prose docs."* That is the rule. This file is how to honour it,
and how to tell the sources apart when they disagree — which they do.

## The chain, and who wins

```
reference/tierra-v6.02/            Tom Ray's original C, vendored pristine. © Tom Ray.
        │                          AUTHORITATIVE for: what Tierra IS.
        ▼
docs/original-tierra/*.md          Line-cited reverse-engineering of the above.
        │                          A faithful index INTO the C, not a substitute.
        ▼
docs/spec/**                       Design intent for the 2026 rebuild. States what we
        │                          MEANT to build, and carries a fidelity ledger.
        ▼                          NOT authoritative for current behaviour — it can lag.
packages/engine/src/*.ts           The implementation. AUTHORITATIVE for what
        │                          tierra26 DOES, today, full stop.
        ▼
docs/bible/**                      The documentation. Must match the engine exactly.
```

Two rules follow, and they matter:

1. **For any claim about what tierra26 does, read the engine.** Not the spec, not a
   sibling Bible page, not this file. The engine is the only thing that runs.
2. **For any claim about original Tierra, read the vendored C** and cite it `file:line`
   — the same convention `docs/original-tierra/` uses. `docs/original-tierra/` is the
   fastest way to *find* the right line; the C is what proves it.

## A worked example of why the order matters

`docs/spec/engine/ISA-VM-SPEC.md` §10 (the fidelity ledger) says tierra26 changed stack
over/underflow from Tierra's "silent circular" to "**set `E`**". Its own §11 open items
then say *"Stack fault vs silent wrap — confirm we want `E`."*

The engine has not done that:

```ts
// packages/engine/src/cpu.ts
/** push onto the silent 10-slot ring: write at sp, advance (wraps, no fault — S22). */
export function push(cpu: Cpu, v: number): void {
  cpu.stack[cpu.sp] = v | 0;
  cpu.sp = (cpu.sp + 1) % STACK_SIZE;
}
```

No flag. So the spec describes an intention that was never implemented, and the Bible's
`pushA.md` — *"a 10-slot ring with **no overflow fault** — an 11th push silently
overwrites the oldest saved value"* — is the correct document. Had it been written from
the spec it would be wrong.

**Never document from the spec.** Use it to understand *why* something is the way it is,
then verify *what* it is in the engine.

## Where to verify what

| Claim about | Read |
|---|---|
| What an opcode is, its kind, its fixed register bindings, template direction | `packages/engine/src/isa.ts` — the `DictEntry` table |
| What an opcode actually does, what it reads/writes, what raises `E` | `packages/engine/src/handlers.ts` — the 32 execute handlers |
| Decode, template measurement, the `mal`/`divide`/copy gates, reaper and error consequences | `packages/engine/src/world.ts` — `stepOne` |
| Registers, flags, the 10-slot ring stack, IP | `packages/engine/src/cpu.ts` |
| Circular addressing and write protection | `packages/engine/src/soup.ts` |
| Complementary nop-template search, `MAX_TEMPLATE`, direction, tie-breaking | `packages/engine/src/template.ts` |
| Copy-flaw, operand flaw, cosmic tick, divide-time operators | `packages/engine/src/mutation.ts` |
| Allocation and first-fit | `packages/engine/src/alloc.ts` |
| Determinism and the PRNG | `packages/engine/src/rng.ts` |

Read the handler, not its neighbours. Sibling opcodes look alike and are not: `adro`
searches outward with **forward winning ties**, `adrb` only backward, `adrf` only
forward; `popC` writes the counting register and yet sets **no** flags because the pop
handler skips `applyFlags`.

## Known deliberate divergences from original Tierra

`docs/spec/engine/ISA-VM-SPEC.md` §10 is the ledger — read it, and treat every row as
*intent* to be confirmed in the engine. The load-bearing ones for documentation:

- **4 registers (A–D), not 6 (A–F).** Tierra's `NUMREG = 6`
  (`reference/tierra-v6.02/tierra/configur.h:44`); tierra26's `NUMREG = 4`
  (`packages/engine/src/cpu.ts`). classic-32 only ever bound A–D, so nothing is lost —
  but never write "six registers" in this corpus.
- **classic-32 is the canonical core**, with opcode order taken from Tierra's
  `gb0/opcode.map` ("Set 0"). Tierra's default *shipped* set is the 64-instruction
  `gb8` bundle, and its dictionary has 122 entries. So "the 32 instructions" is true of
  tierra26 and is **not** a claim about Tierra's size.
- **Register toggles, bit-width/segmented addressing, threads and networking are
  omitted** from the core. Do not document them as if a learner could reach them.
- **`ttime` is a cycle count, not wall-clock seconds**, and the PRNG is seeded with
  seed 0 meaning "normal" — both for determinism. Anything a document says about
  reproducibility rests on this.

Preserved **exactly**, and therefore safe to document as Tierra's own mechanics:
template addressing, write protection, the mal→copy→divide life cycle, the 0.7 write
gate, flaw/copy/cosmic mutation, and integer determinism.

## Citing

- Engine behaviour: name the file, and the constant or function. `` `MAX_TEMPLATE = 10`
  (`packages/engine/src/template.ts`) ``. In Advanced prose the identifier in backticks
  is usually citation enough.
- Original Tierra, when a document explicitly talks about it: `file:line` into
  `reference/tierra-v6.02/`, e.g. `` `STACK_SIZE 10` (`tierra/configur.h:41`) ``.
  **Cite the definition, not a use.** `docs/original-tierra/01-cpu-model.md` cites
  `tierra.h:1229` for the same constant — which is real, but it is the
  `Reg st[STACK_SIZE];` field declaration, not the `#define`. Both are true; only one
  answers "what is the value and who decides it". Re-derive a citation from the C
  before you copy it into a Bible page.
- Never cite `docs/spec/**` in a Bible page. It is not a source about behaviour.

## What CI already guarantees

- **The Bible is a bijection with the engine's instruction dictionary.** Every mnemonic
  has exactly one page and every page has a mnemonic — `packages/content/test/08-docs.test.ts`
  and `scripts/gen-bindings.ts` both fail otherwise. You cannot forget to add a page.
- **Every page carries the frontmatter the codegen reads**, display names are unique and
  never collide with a mnemonic, and every page declares a glyph and a colour role.
- **Every lesson's starter and solution genome compiles and runs**, the starter does not
  already pass, the solution passes within budget, and no lesson uses a verb it has not
  unlocked.

What CI does **not** check is whether a sentence is *true*. Nothing verifies that
`ifz.md` describes `ifz`. That is what reading the handler is for, and it is the whole
job of the opcode accuracy pass.

## Reviewing an opcode page for accuracy

For each of the 32, in this order:

1. Open `isa.ts` and find the `DictEntry`: id, kind, exec handler, template direction,
   register binding. Check the page's frontmatter `reads`/`writes`/`takes_target`/`bytes`
   against it.
2. Open the named handler in `handlers.ts`. Write down: what it reads, what it writes,
   which flags it sets, and every path that raises `E`.
3. Check `## Reads / Writes / Flags` bullet by bullet against that. This section is the
   most mechanical and the easiest to get subtly wrong — an omitted "sets no S/Z" is a
   wrong model.
4. Check `## Advanced` for the operation, the coercion (`| 0`), the order of gates, and
   the do-nothing-on-failure cases.
5. Check `## Simple` against the *one test*: is every sentence still true at the
   Advanced level? (`references/voice.md`)
6. Check `## Gotchas` for the silences — no-fault wraps, thresholds that still succeed,
   flags cleared without undoing a consequence.
7. Check `## See also` links resolve and point somewhere a reader would actually want
   next.
8. `doclint check <path>` and `npm test`.
