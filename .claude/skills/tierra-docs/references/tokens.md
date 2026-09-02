# The `{token}` grammar

A token names a part of the machine inside a sentence. It is the only way to do that —
`<Chip>` was retired so there would be exactly one.

## Shape

```
{name}            {name target}
```

Both words match `[A-Za-z][\w-]*` (the target may also start with a digit). **A space
inside either word makes it not a token**: the parser leaves the whole brace group as
plain text, so `{soup free space}` renders — braces and all — on the page. That is
silent in the app and loud in `doclint check`.

Ordinary prose braces are safe: `a {}` and `use {0, 1} bits` stay text, because they
fail the shape.

## The four namespaces, in resolution order

`resolveToken` (in `packages/content/src/doclang.ts`) checks in this fixed order, so a
token can never be one kind of thing to the validator and another to the renderer.

| Written | Kind | Renders as | Card it opens |
|---|---|---|---|
| `{register-a}` … `{register-d}` | register | `A` | the register page, plus that register's role |
| `{flag-e}` `{flag-s}` `{flag-z}` | flag | `E` | the flags page |
| `{soup}` `{save-pile}` `{template}` | concept | the slug | that concept's Bible page |
| `{incA}` or `{grow-a}` | opcode | mnemonic in advanced mode, display name in simple | the full opcode tooltip |
| `{jmpb top}` | opcode + label | `jump-back top` | same |
| `{template signpost}` | concept + word | `signpost` | the template page |

The register and flag prefixes are checked **first and explicitly**, so they can never
be shadowed by a concept page. Note the consequence: `{register}` on its own is the
*concept page*, because the prefix rule needs the dash and the letter.

An opcode resolves by mnemonic **or** by its bound display name, so `{incA}` and
`{grow-a}` are the same chip. Prefer the **mnemonic** — it is the engine's immutable
identity, and the language toggle decides what the reader sees.

A backticked mnemonic also becomes a chip: `` `mal` `` renders exactly like `{mal}`.
That is why Bible prose can write `` `movii` `` inline and still get a chip. Use a
token when you want the label form or a synonym; a backtick is fine for a bare mention.

## Saying a concept in the lesson's own word

`{template signpost}` is the single most useful form in this corpus. The second word
replaces what the chip *reads*, while the glyph, the colour role and the card all stay
the concept's own. It exists so a lesson can teach in kid words without the docs
inventing a parallel vocabulary.

The words this corpus already uses — run `doclint vocab` for the live list:

```
{template signpost}   {label landmark}    {soup world}     {daughter baby}
{reading-head reader} {save-pile pile}    {register boxes} {instruction-cycle tick}
{mutation copy-flaw}  {mutation breed-true}  {gates gate}   {age Age}
```

`{age Age}` shows the other use: the target also fixes capitalisation at the start of a
sentence, since a chip renders its name verbatim.

Plurals work — `{template signposts}`, `{daughter babies}` — because the target is just
a display word.

**A phrase cannot be a target.** For "the reading head" write `the {reading-head}`, or
chip the one word that carries the meaning: `the {reading-head reader}`.

## Where a token is NOT allowed

- **Inside `*em*` or `**strong**`.** `splitInline` extracts tokens before `emphasise`
  runs, so the asterisks end up in different text runs, never match as a pair, and
  render as literal `*` characters. This is the single most common way to break a page.
  Move the chip outside the emphasis, or drop the emphasis — a chip already reads as
  emphasis.
- **In frontmatter.** No frontmatter value goes through MiniMark. `Chapter.tsx` prints
  `lede` as a plain string.
- **Inside a `` `code span` ``.** Backticks win; the braces stay literal.
- **In a `## See also` link list.** Those are markdown links and should stay links.

## Where a token still has to make sense

A token is not only rendered in prose. The same string is flattened to plain text in
two other places, both by `plainText` in `packages/app/src/doc/docs.ts`:

- **Hover cards.** `TokenTooltip` shows a page's Simple (or Advanced) section as one
  flat paragraph — a chip inside a card a chip just opened would nest badly. A token
  flattens to the word a reader would have *seen*: the synonym for a concept written in
  one, the canonical name otherwise, `name target` for an instruction with a label, and
  the bare letter for a register or flag.
- **The Bible index gloss.** `glossOf` takes the parenthetical from a page's `title` if
  it has one, else the **first sentence of its Simple section**. So the first sentence
  of Simple is doing double duty as an index card — write it to stand alone.

Practical consequence: `{register-a}` in an opcode's Simple section flattens to `A`, so
"points box {register-a} at the start" reads correctly as "points box A at the start" on
the index card. Verify with:

```bash
node --experimental-strip-types .claude/skills/tierra-docs/scripts/doclint.ts check docs/bible/opcodes/mal.md
npx vitest run --project=storybook src/doc/TokenTooltip.stories.tsx --root packages/app
```

That second command renders a card for **every** concept page from the real corpus and
fails if any comes back empty or with a brace in it.

## An unknown token is an error, not a warning

`{nosuchthing}` fails the build. That is deliberate: it would render as something
unrecognisable, and the author almost certainly meant a real thing. The diagnostic names
the four namespaces. Fix the spelling, or add the page first.
