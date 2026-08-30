# GeneScript Language & Syntax — Engineering Spec              (Code: GS · Milestone: M2)

**Status:** v1, authored. The lexical grammar and surface syntax of GeneScript: how source
text becomes **tokens** and then a best-effort **AST** of statements, labels, control targets
and raw instructions. This is the front of the compile pipeline — every other GeneScript
system consumes the AST this doc defines.

**Upstream refs:** [`00-overview.md`](00-overview.md) §2 (the concrete language at a glance),
§3 (the pipeline — lexer/parser at stage 01), §4 (system map: 01 → AST → 06/03/04, and 07
shares this AST), §5 (contracts), §7 (authoring conventions).
[`../engine/ISA-VM-SPEC.md`](../engine/ISA-VM-SPEC.md) §3.3 (the classic-32 set + provisional
GeneScript verb names this syntax spells out) and §5 (template addressing — the mechanism
that **labels** lower to, so this layer never spells `nop0`/`nop1` except in raw mode).
Doc template & test conventions: [`../engine/systems/00-architecture.md`](../engine/systems/00-architecture.md)
§8.1/§8.3/§8.4 (reused verbatim).

**Contracts obeyed:** **C-GS-DET** (lexing/parsing is a pure function of source text — no RNG,
no wall-clock; token/statement order is source order). **C-GS-NOOPCODES** (the parser knows
*syntax*, not opcode numbers; verb→mnemonic→opcode resolution is downstream in [02]/[04]).
**C-GS-KID** (any diagnostic this layer emits is plain-language, ages 8–16; tone rules owned
by [06]). The parser is **error-tolerant**: it never throws on bad input; malformed lines
become diagnostic-bearing AST nodes so the editor always has a tree to render.

---

## 1. Purpose & responsibility

This system owns the **front end** of the GeneScript compiler: turning raw source text into a
stream of **tokens** (the lexer) and then into an ordered **AST of statements** (the parser).
It must guarantee: (a) a small, unambiguous **lexical grammar** — line-oriented, `#`-comments
to end of line, case-insensitive keywords, insignificant whitespace/indentation; (b) exactly
the **statement forms** the concrete language defines — a bare verb, a register-specific verb,
a control verb with a **label target**, a **label definition** (`name:`), and a `raw
<mnemonic>` line for literal classic-32 access; (c) **labels are addressing landmarks, not
executable statements** — they name positions and are lowered to complementary nop-templates
downstream ([03]), never emitted as their own opcode; (d) a formal-ish **EBNF** the lexer and
parser jointly satisfy; (e) **error tolerance** — every input, however malformed, yields a
best-effort AST (unknown/garbled lines become `ErrorStmt`/`UnknownVerb` nodes carrying a
diagnostic), so the editor, block view ([07]), validator ([06]) and compiler ([04]) always
receive a well-formed tree. This layer is **pure and stateless**: text in, tokens + AST out;
it resolves no opcodes and allocates no templates.

---

## 2. Interfaces

The front end exposes two pure functions and the AST types they produce. Consumers: [06]
(validate the AST → diagnostics), [03]/[04] (lower the AST → templates → bytes), [07] (render
the same AST as blocks). No consumer reads tokens directly except the lexer's own tests.

```ts
// lex: source text → ordered tokens (never throws; unrecognized chars → Token{kind:'error'})
export function lex(source: string): Token[];

// parse: tokens (or source, via lex) → best-effort program AST (never throws)
export function parse(source: string): Program;

export interface Token {
  kind: 'word' | 'colon' | 'comment' | 'newline' | 'eof' | 'error';
  text: string;                 // raw lexeme as written (original case preserved)
  line: number;                 // 1-based
  col: number;                  // 1-based, column of first char
}

export interface Program {
  statements: Stmt[];           // in source order; blank/comment-only lines produce no Stmt
  diagnostics: Diagnostic[];    // parser-level, best-effort (kid tone applied by [06])
}

// Discriminated union — the AST shape every downstream system consumes.
export type Stmt =
  | LabelDef      // `name:`            — an addressing landmark (NOT executable)
  | VerbStmt      // `copy-byte`, `grow-a`  — a bare or register-specific verb, no target
  | ControlStmt   // `jump-back copy`   — a control verb + a label target
  | RawStmt       // `raw movii`, `raw nop0` — literal classic-32 mnemonic (advanced mode)
  | ErrorStmt;    // a line that could not be parsed — carries a diagnostic, never crashes

export interface Loc { line: number; startCol: number; endCol: number; }

export interface LabelDef    { kind: 'label';   name: string; loc: Loc; }
export interface VerbStmt    { kind: 'verb';    verb: string; loc: Loc; } // canonicalized lower-case
export interface ControlStmt { kind: 'control'; verb: string; target: string | null; loc: Loc; }
export interface RawStmt     { kind: 'raw';     mnemonic: string; loc: Loc; } // incl. nop0/nop1
export interface ErrorStmt   { kind: 'error';   raw: string; diagnostic: Diagnostic; loc: Loc; }

export interface Diagnostic {
  severity: 'error' | 'warning' | 'hint';
  message: string;              // plain wording; [06] may refine tone
  loc: Loc;
}
```

Whether a verb is *bare* vs *register-specific* vs *control* is a **vocabulary** fact ([02]),
not a syntactic one — syntactically a `ControlStmt` is "a word followed by a word", a
`VerbStmt` is "a lone word". The parser classifies control-vs-verb by consulting the vocabulary
table ([02]); with no vocabulary loaded it still parses shape (word, word+word, word+`:`,
`raw`+word) and defers verb legality to [06]/[04]. This keeps the front end **C-GS-NOOPCODES**
clean.

---

## 3. Data structures

- **Token stream** — flat array in source order. `newline` tokens are retained (the grammar
  is line-oriented: one statement per line), so the parser segments purely on `newline`/`eof`
  without re-scanning whitespace. `comment` tokens are retained by the lexer (for the editor's
  syntax highlighting) but are **discarded by the parser** — they never reach the AST.
- **`Loc`** — every `Stmt` and `Diagnostic` carries a source location (1-based line + column
  range). This is the seed of the **source map** ([04] builds line↔byte ranges on top of it)
  and lets [06]/the editor underline the exact offending span. Integer-only.
- **`Program.statements`** — ordered; **a genome is exactly this ordered list of statements**.
  Blank lines and comment-only lines contribute **no** statement (they are pure whitespace to
  the AST). Statement order is the program's execution order after lowering.
- **`LabelDef` is a landmark, not code** — it occupies a slot in `statements` (so its position
  relative to verbs is known) but it emits **no opcode of its own**. [03] reads label positions
  and references to synthesize complementary nop-templates; a `LabelDef` never becomes an
  executable instruction. This is the single most important structural fact of the language:
  kids mark places; the compiler turns places into templates.
- **Identifier table (implicit)** — label names and control targets are identifiers. The
  parser does not resolve targets to definitions (that binding check is [06]'s job); it only
  records the target *string*. So a forward reference (`jump-back done` before `done:`) parses
  fine and is validated later.

### Identifier rules (labels & targets)
A label/target identifier: starts with an ASCII letter (`[A-Za-z]`), continues with letters,
digits, `-` or `_` (`[A-Za-z0-9_-]*`); it is **case-insensitive for matching** but the AST
preserves the author's original casing for display. A trailing `:` marks a **definition**; the
same identifier bare after a control verb is a **reference**. Reserved: an identifier that is
also a known verb is still a legal label name syntactically (shape wins); [06] warns on the
shadowing. `raw` is a keyword only in leading position.

---

## 4. Behavior / algorithms

**Lexing** (one linear pass, no lookahead beyond the current char):
```
for each char:
  '#'                       → start a comment token, consume to end of line (exclusive of \n)
  '\n'                      → emit newline token
  ':'                       → emit colon token
  whitespace (space/tab)    → skip (insignificant); ends the current word
  identifier char           → accumulate into a word token
  anything else             → emit an error token (single char), continue (tolerance)
at EOF                      → emit eof token
```
Whitespace and indentation are **insignificant** — indentation in the illustrative creature is
purely cosmetic. Case is preserved in the token `text`; canonicalization to lower-case happens
in the parser when building `VerbStmt.verb`/`RawStmt.mnemonic`.

**Parsing** (segment on `newline`/`eof`, then classify each line's non-comment tokens):
```
tokens := lex(source)
for each line-run of tokens (split on newline, dropping comment tokens):
  words := the non-trivia tokens on this line
  case words of
    []                                   → (blank / comment-only) emit no Stmt
    [ w ] where w ends the line, next is ':'  → LabelDef(name = w)      // `name:`
        (colon immediately follows the single word, no target after)
    [ 'raw', m ]                         → RawStmt(mnemonic = lower(m)) // incl. nop0/nop1
    [ v ]                                → classify v via vocab:
                                             control verb → ControlStmt(v, target=null)  // missing target
                                             else         → VerbStmt(v)
    [ v, t ]                             → ControlStmt(verb = v, target = t)
    otherwise (extra words / stray ':' / lone ':' / 'raw' with no mnemonic)
                                         → ErrorStmt(raw = line text, diagnostic)
```
Notes:
- **Case-insensitive keywords:** `COPY-BYTE`, `Copy-Byte`, `copy-byte` all canonicalize to the
  same `VerbStmt.verb`. Label/target *matching* is likewise case-insensitive ([06] compares
  canonicalized names); display casing is preserved.
- **One statement per line:** two verbs on one line (`copy-byte divide`) is not "two
  statements" — for a non-control word it is an `ErrorStmt` (the parser does not silently split
  lines). A control verb legitimately takes exactly one trailing word (its target).
- **Control verb missing its target** (`jump-back` with nothing after) parses to a
  `ControlStmt` with `target: null` **plus** a diagnostic — a best-effort node the editor can
  still show, rather than a hard failure.
- **`raw` mode** drops straight to a classic-32 mnemonic and is the **only** way to write
  `nop0`/`nop1` explicitly (worded mode never exposes templates). `raw <mnemonic>` is parsed
  structurally here; whether the mnemonic is legal for the active set is [04]'s check.

**Error tolerance philosophy.** The parser's contract is *always return a tree*. Any line it
cannot fit to a known shape becomes an `ErrorStmt` carrying a `Diagnostic` and the raw text,
and parsing continues with the next line. Unknown chars become `error` tokens rather than
aborting the lex. This is what lets the editor render, highlight and partially compile a
half-typed program — the AST is a **best-effort** structure, not an all-or-nothing parse.

---

## 5. Interconnections

- **Produces the AST** consumed by **[06] Diagnostics** (binds targets→labels, checks verb
  legality/active-subset, kid-tone messages), **[03] Labels & Templates** + **[04] Compiler**
  (lower statements→bytes; `LabelDef`s become templates, references become complementary
  templates), and **[07] Block form** (renders the *same* AST as drag blocks — text and blocks
  are two views of one tree, per [00] §1/§4).
- **Depends on [02] Vocabulary** only to *classify* a word as control-vs-verb and to know
  which verbs are register-specific; it hard-codes no verb list and (per **C-GS-NOOPCODES**) no
  opcodes.
- **Feeds the source map:** every `Stmt.loc` is the origin [04] threads through to line↔byte
  ranges (`GSINV-SOURCEMAP`).
- Crosses **C-GS-DET** (pure function of text) and **C-GS-KID** (diagnostic wording).

---

## 6. Determinism & edge cases

- **Deterministic:** `lex`/`parse` are pure functions of the input string — same text →
  identical tokens, AST and diagnostics, in source order (**C-GS-DET**). No RNG, no clock, no
  `Map`-key-order traversal.
- **Blank & comment-only lines:** produce no `Stmt` (dropped from the AST) but still advance
  line numbers so later `loc`s stay accurate.
- **Trailing comment on a statement:** `find-back start   # locate my start` — the comment is
  lexed then discarded; the statement parses normally.
- **Whitespace/indentation:** insignificant; leading/trailing/interior runs of spaces or tabs
  collapse to token boundaries. Indentation carries no meaning.
- **`name:` vs `raw`:** a lone identifier followed by `:` is always a `LabelDef`; `raw` in
  leading position is always the raw keyword (a label literally named `raw:` is still a label —
  the `:` disambiguates).
- **Empty source / whitespace-only source:** a valid `Program` with `statements: []` and no
  diagnostics.
- **A malformed line never aborts the file:** it becomes one `ErrorStmt`; subsequent lines
  parse independently.

---

## 7. Fidelity notes

- **[CORE] — the worded surface.** One-statement-per-line, `#` comments, case-insensitive
  keywords, label-definitions, and control-verb-plus-label-target are the core language every
  kid writes. Labels-as-landmarks (never executable, lowered to templates by [03]) is the
  central abstraction that hides Tierra's template gotcha (ISA-VM §5.5) from beginners.
- **[OPTIONAL] — raw mode.** `raw <mnemonic>` (incl. explicit `nop0`/`nop1`) is the
  advanced/literal escape hatch for older kids and under-the-hood editing. It is deferrable
  from the youngest-kid experience but its *syntax* is specified here so [04]/[05] have a
  literal form to emit into and disassemble back to.
- **[MOD] — case-insensitivity & display casing.** Tierra source is a raw byte genome with no
  concept of a friendly identifier; GeneScript adds case-insensitive keywords with
  casing-preserving display purely as a modern authoring affordance. No engine semantics change.

---

## 8. Acceptance criteria

Each maps 1:1 to a pending test in `packages/genescript/test/01-gs.test.ts`. IDs are
append-only.

- **GS-001** — A `#` starts a comment: everything from `#` to end of line is ignored and
  produces no AST node (a trailing comment on a statement does not change that statement).
- **GS-002** — A **bare verb** on its own line (`copy-byte`) parses to a single `VerbStmt`
  whose `verb` is the canonicalized keyword.
- **GS-003** — A **register-specific verb** (`grow-a`, `save-c`) parses to a `VerbStmt` just
  like a bare verb (no operand syntax); the register is intrinsic to the verb, not a token.
- **GS-004** — A **label definition** (`name:`) parses to a `LabelDef`, a node distinct from a
  verb, carrying the identifier name.
- **GS-005** — A **control verb + target** (`jump-back copy`) parses to a `ControlStmt` that
  captures both the verb and its **label target** string.
- **GS-006** — A control verb with **no target** (`jump-back` alone) still yields a
  `ControlStmt` (with `target: null`) plus a diagnostic — a best-effort node, not a crash.
- **GS-007** — `raw <mnemonic>` parses to a `RawStmt` carrying the literal classic-32 mnemonic
  (advanced/literal mode).
- **GS-008** — `raw nop0` (and `raw nop1`) parse in raw mode — the explicit template no-ops are
  writable *only* via `raw`, never as worded verbs.
- **GS-009** — **Keywords are case-insensitive:** `COPY-BYTE`, `Copy-Byte`, `copy-byte`
  canonicalize to the same `VerbStmt.verb`.
- **GS-010** — **Blank lines are ignored:** blank and whitespace-only lines produce no `Stmt`,
  and following statements keep correct line numbers.
- **GS-011** — **Whitespace/indentation is insignificant:** leading/interior indentation does
  not change the parsed statement (indentation is cosmetic only).
- **GS-012** — **A genome is the ordered list of statements:** parsing preserves source order,
  and `LabelDef`s occupy their in-order slot among verbs.
- **GS-013** — **Labels are landmarks, not executable:** a `LabelDef` is present in the AST as
  a distinct landmark node and is documented as lowering to a template ([03]), never to an
  opcode of its own.
- **GS-014** — **Label/target identifier rules:** an identifier starts with a letter and may
  contain letters/digits/`-`/`_`; matching is case-insensitive while the AST preserves the
  author's original casing.
- **GS-015** — **Forward references parse:** a control target referencing a label defined later
  (`jump-back done` before `done:`) parses without error (binding is deferred to [06]).
- **GS-016** — **A malformed line yields a diagnostic-bearing `ErrorStmt`** (e.g. two verbs on
  one line, a stray `:`, or `raw` with no mnemonic) — the parser records a `Diagnostic` and
  continues; it never throws.
- **GS-017** — **Empty/whitespace-only source** parses to a valid `Program` with no statements
  and no diagnostics.
- **GS-018** — **The AST is the shared surface:** `parse` returns the `Program`/`Stmt` shape
  ([04]/[06]/[07] consumers), with each `Stmt` carrying a `Loc` (the source-map seed).

---

## 9. Open questions

1. **Vocabulary coupling.** The parser needs [02] to tell control verbs from plain verbs.
   Confirm the seam: does `parse` take an active-vocabulary argument, or does it emit a
   shape-only AST that [06] re-classifies? (Current lean: shape-only front end, classification
   in [06], keeping [01] free of vocabulary state.)
2. **Multi-word register verbs vs control verbs.** If any register-specific verb ever needs a
   trailing word, the `[v, t]` → `ControlStmt` rule becomes ambiguous. Confirm the vocabulary
   guarantees register verbs are always operand-free (§2 assumption).
3. **Comment-only vs inline-comment retention.** The lexer keeps `comment` tokens for
   highlighting; confirm the editor/[07] wants comment *round-tripping* (comments surviving a
   text→blocks→text trip) or whether comments are display-only and dropped on lowering.
4. **Identifier charset.** `-`/`_` both allowed in labels; confirm this doesn't collide with
   verb spelling (verbs also use `-`). A label named exactly like a verb is legal shape but
   [06]-warned — confirm that is the desired ergonomics.
