// ============================================================================
// DOCLINT — the authoring-time checks the corpus test cannot make.
//
// `npm test` proves a document PARSES and VALIDATES. It cannot tell you that
// `*{register-a} minus {register-b}*` will render its asterisks as literal
// characters, that `{soup free space}` will print its own braces, or that the
// `A` you just replaced was the English article. Every one of those shipped at
// least once. They are all mechanical, so they belong in a tool.
//
// IT IMPORTS THE REAL PARSER. `resolveToken` comes from
// packages/content/src/doclang.ts, and the tag vocabulary from its MANIFEST, so
// this linter cannot drift from what the app actually renders — and the token
// namespaces are read off disk, so a concept page added five minutes ago is
// already part of the vocabulary. Nothing here is a second copy of anything.
//
// Brace groups are found with a DELIBERATELY wider regex than the parser's own
// scanner, because the parser drops a malformed group silently as plain text —
// and a token that renders as its own braces is precisely what we are hunting.
//
// Run from the repo root:
//   npm run docs:vocab                       what {tokens} and <Tags> resolve
//   npm run docs:lint  [-- path... --all]     the authoring checks
//   ... doclint.ts facts <mnemonic>           the engine's own truth for one opcode
//   ... doclint.ts new <kind> <slug>          scaffold a page from templates/
// ============================================================================
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveToken } from '../../../../packages/content/src/doclang.ts';
import { DICTIONARY } from '../../../../packages/engine/src/isa.ts';
import {
  MANIFEST,
  REGISTER_IDS,
  FLAG_IDS,
  GOAL_KINDS,
  FOCUS_VALUES,
  STAGE_CONDITIONS,
  RETIRED_TAGS,
} from '../../../../packages/content/src/manifest.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const OPCODES = path.join(ROOT, 'docs/bible/opcodes');
const CONCEPTS = path.join(ROOT, 'docs/bible/concepts');
const LESSONS = path.join(ROOT, 'docs/lessons');

// ---------------------------------------------------------------------------
// The live vocabulary, read off disk every run
// ---------------------------------------------------------------------------
const mdIn = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();

const frontmatterOf = (src: string): Record<string, string> => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]!] = kv[2]!.trim().replace(/^["']|["']$/g, '');
  }
  return out;
};

const conceptSlugs = mdIn(CONCEPTS).map((f) => f.slice(0, -3));
const opcodePages = mdIn(OPCODES).map((f) => {
  const slug = f.slice(0, -3);
  const fm = frontmatterOf(readFileSync(path.join(OPCODES, f), 'utf8'));
  return { slug, name: fm['name'] ?? slug, emoji: fm['emoji'] ?? '', category: fm['category'] ?? '' };
});
const opcodeNames = new Set(opcodePages.flatMap((o) => [o.slug, o.name]));

// The same two lookups the renderer resolves a token with.
const TOKENS = {
  isOpcode: (t: string) => opcodeNames.has(t),
  hasConcept: (s: string) => conceptSlugs.includes(s),
};

// ---------------------------------------------------------------------------
// The ONE hand-maintained table in this tool: the kid words the docs use for a
// concept. A slug is derivable; "signpost" is not. Add a row when a document
// starts teaching a thing under a new word.
// ---------------------------------------------------------------------------
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  template: ['signpost', 'signposts'],
  label: ['landmark', 'landmarks'],
  soup: ['world'],
  daughter: ['baby', 'babies'],
  'reading-head': ['reader', 'reading head'],
  'save-pile': ['pile', 'stack', 'ring stack'],
  'instruction-cycle': ['tick', 'ticks'],
  register: ['box', 'boxes', 'notebook', 'notebooks'],
  mutation: ['copy-flaw', 'breed-true', 'flaw seam'],
  gates: ['gate'],
};

/** A synonym is only writable as a token if it is ONE word — the grammar's
 *  target is `[A-Za-z0-9][\w-]*`. "reading head" is a phrase you chip one word
 *  of ("the {reading-head reader}"), not a target you can write whole. */
const isTarget = (word: string) => /^[A-Za-z0-9][\w-]*$/.test(word);

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------
type Severity = 'error' | 'warn' | 'info';
interface Finding {
  file: string;
  line: number;
  code: string;
  severity: Severity;
  message: string;
}
const findings: Finding[] = [];
const add = (file: string, line: number, severity: Severity, code: string, message: string) =>
  findings.push({ file, line, code, severity, message });

// ---------------------------------------------------------------------------
// Helpers that mirror the renderer's own reading of a line
// ---------------------------------------------------------------------------
/** Blank out code spans and tokens, so a check only sees prose that is not
 *  already spoken for. The filler is NUL, deliberately not a space: `maskCode`
 *  feeds the double-space check, and blanking a `code span` to spaces would
 *  make that fire on every backticked word. */
const maskSpoken = (text: string) =>
  text.replace(/`[^`]*`|\{[^}]*\}/g, (m) => '\0'.repeat(m.length));

/** Blank out code spans only. */
const maskCode = (text: string) =>
  text.replace(/`[^`]*`/g, (m) => '\0'.repeat(m.length));

/** The parser's own token shape: `{name}` or `{name target}`, one word each. */
const TOKEN_SHAPE = /^([A-Za-z][\w-]*)(?:\s+([A-Za-z0-9][\w-]*))?$/;

/** Split a body into blocks — a paragraph, or one list item. The unit a card is
 *  counted against. */
function blocksOf(body: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let cur: string[] = [];
  let start = 1;
  body.split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === '' || /^\s*(-|\d+\.)\s/.test(line)) {
      if (cur.length) out.push({ line: start, text: cur.join('\n') });
      cur = [];
      start = i + 1;
    }
    cur.push(line);
  });
  if (cur.length) out.push({ line: start, text: cur.join('\n') });
  return out;
}

const TABLE_DELIM = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/;

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------
function checkDoc(rel: string, kind: 'opcode' | 'concept' | 'lesson', src: string) {
  const lines = src.split(/\r?\n/);
  const fmEnd = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  const fm = frontmatterOf(src);
  const slug = path.basename(rel, '.md').replace(/^\d+[-_]/, '');
  const body = fmEnd > 0 ? lines.slice(fmEnd + 1).join('\n') : src;
  const bodyOffset = fmEnd > 0 ? fmEnd + 1 : 0;

  // -- frontmatter ---------------------------------------------------------
  const required =
    kind === 'opcode'
      ? ['mnemonic', 'name', 'category', 'emoji']
      : kind === 'concept'
        ? ['slug', 'title', 'emoji', 'category']
        : ['id', 'no', 'title', 'phase', 'lede', 'ready'];
  for (const key of required) {
    if (!(key in fm)) add(rel, 1, 'error', 'FM-MISSING', `frontmatter is missing "${key}"`);
  }
  const idKey = kind === 'opcode' ? 'mnemonic' : kind === 'concept' ? 'slug' : 'id';
  if (fm[idKey] && fm[idKey] !== slug) {
    add(rel, 1, 'error', 'FM-ID', `${idKey} "${fm[idKey]}" does not match the filename "${slug}"`);
  }

  // A concept's chip name is `title.split(' (')[0]` in scripts/gen-bindings.ts,
  // and the Bible index gloss is the parenthetical. `slug (gloss)` is therefore
  // load-bearing in two places, not a style preference.
  if (kind === 'concept' && fm['title'] && !new RegExp(`^${slug} \\(.+\\)$`).test(fm['title'])) {
    add(rel, 1, 'error', 'FM-TITLE', `concept title must read "${slug} (a short gloss)"`);
  }

  // A token in frontmatter renders as literal braces: Chapter.tsx prints `lede`
  // as a plain string, and no frontmatter value goes through MiniMark.
  if (fmEnd > 0) {
    for (let i = 0; i <= fmEnd; i++) {
      if (/\{[A-Za-z][\w-]*(\s+[\w-]+)?\}/.test(lines[i]!)) {
        add(rel, i + 1, 'error', 'FM-TOKEN', 'frontmatter is plain text — a token here shows its braces');
      }
    }
  }

  // -- line-level body checks ----------------------------------------------
  lines.forEach((raw, i) => {
    if (i < bodyOffset) return;
    const lineNo = i + 1;

    // Every brace group: does it resolve, and is its target legal?
    for (const m of raw.matchAll(/\{([^}]*)\}/g)) {
      const inner = m[1]!;
      const shape = TOKEN_SHAPE.exec(inner);
      if (!shape) {
        // The parser leaves an unparseable brace group as plain text, so this
        // is silent on the page. Only flag it when it LOOKS like an attempt —
        // matched on the LEADING word rather than the first whitespace-split
        // one, so `{register-c/d}` is caught too: the slash is what breaks it,
        // and splitting on spaces would never have noticed.
        const lead = /^[A-Za-z][\w-]*/.exec(inner.trim())?.[0] ?? '';
        if (resolveToken(lead, TOKENS) || /^[a-z][\w-]*$/.test(lead)) {
          add(rel, lineNo, 'error', 'TOKEN-SHAPE',
            `{${inner}} is not a token — it renders as literal text. A token is {name} or {name one-word-target}`);
        }
        continue;
      }
      const [, name, target] = shape as unknown as [string, string, string | undefined];
      const r = resolveToken(name, TOKENS);
      if (!r) {
        add(rel, lineNo, 'error', 'TOKEN-UNKNOWN',
          `{${name}} names nothing. Run \`doclint vocab\` for what resolves`);
        continue;
      }
      if (target !== undefined && (r.kind === 'register' || r.kind === 'flag')) {
        add(rel, lineNo, 'error', 'TOKEN-TARGET',
          `a ${r.kind} takes no second word — write {${name}}`);
      }
      // A cross-wired synonym is the one token error nothing else can see: both
      // halves are individually valid, so it resolves, renders and validates —
      // and then shows the reader `signpost` while opening the `label` card.
      if (target !== undefined && r.kind === 'concept') {
        const owner = Object.entries(SYNONYMS).find(([, words]) =>
          words.some((w) => w.toLowerCase() === target.toLowerCase()),
        );
        if (owner && owner[0] !== r.slug) {
          add(rel, lineNo, 'warn', 'TOKEN-SYNONYM',
            `"${target}" is {${owner[0]}}'s word, not {${r.slug}}'s — this reads "${target}" and opens the ${r.slug} card`);
        }
      }
    }

    // A retired tag degrades to visible angle brackets.
    for (const retired of Object.keys(RETIRED_TAGS)) {
      if (new RegExp(`<${retired}[\\s/>]`).test(raw)) {
        add(rel, lineNo, 'error', 'TAG-RETIRED', `<${retired}> was removed. ${RETIRED_TAGS[retired]}`);
      }
    }

    // An unknown tag also degrades to prose. Only look at lines that are a tag
    // on their own, which is the only shape the parser treats as a tag.
    const tag = /^\s*<\/?([A-Za-z][A-Za-z0-9-]*)/.exec(raw);
    if (tag && /^\s*<\/?[A-Za-z][A-Za-z0-9-]*([\s/>]|$)/.test(raw)) {
      const canonical = Object.keys(MANIFEST).find(
        (n) => n.toLowerCase() === tag[1]!.toLowerCase() ||
          n.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() === tag[1]!.toLowerCase(),
      );
      if (!canonical && !(tag[1]! in RETIRED_TAGS)) {
        add(rel, lineNo, 'error', 'TAG-UNKNOWN',
          `<${tag[1]}> is not a component. Run \`doclint vocab\` for the tag list`);
      }
    }

    // The artefact of a find-and-replace over a single letter.
    const masked = maskCode(raw);
    if (/\S  +\S/.test(masked) && !/^\s*\|/.test(raw)) {
      add(rel, lineNo, 'warn', 'DOUBLE-SPACE', 'two spaces inside a sentence');
    }

    // A pipe row whose delimiter has a different column count is NOT a table —
    // MiniMark leaves the whole thing as a run-on paragraph of pipes.
    if (raw.includes('|') && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1]!.trim())) {
      const cols = (s: string) => s.trim().replace(/^\||\|$/g, '').split('|').length;
      if (cols(raw) !== cols(lines[i + 1]!)) {
        add(rel, lineNo, 'warn', 'TABLE-COLUMNS',
          `header has ${cols(raw)} columns, delimiter has ${cols(lines[i + 1]!)} — this renders as prose, not a table`);
      }
    }
  });

  // -- paragraph-level checks ----------------------------------------------
  // Emphasis does not survive a blank line, and `emphasise` runs per TEXT RUN
  // AFTER splitInline has cut the tokens out — so a `*` pair separated by a
  // token never matches and both asterisks paint as literal characters.
  for (const para of body.split(/\r?\n\s*\r?\n/)) {
    const flat = maskCode(para).replace(/\r?\n/g, ' ');
    for (const m of flat.matchAll(/\*\*(.+?)\*\*|(?<!\*)\*([^*]+?)\*(?!\*)/g)) {
      const inner = m[1] ?? m[2] ?? '';
      if (inner.includes('{') || inner.includes('}')) {
        const line = bodyOffset + body.slice(0, body.indexOf(para)).split('\n').length;
        add(rel, line, 'error', 'EMPHASIS-TOKEN',
          `a token inside *emphasis* renders the asterisks literally — put the chip outside the bold`);
      }
    }
  }

  // -- block-level: a term named with no card anywhere in its block ---------
  // INFO, not a rule. Some slugs are ordinary English — "the raw pieces", "a
  // stack of instruction blocks", "a target-taking opcode" — so this is a list
  // to read, in the same spirit as BARE-LETTER. `## See also` is navigation
  // whose link text is already a link, so it is cut off first.
  const prose = body.split(/^##\s+See also\s*$/m)[0]!;
  for (const { line, text } of blocksOf(prose)) {
    if (/^\s*(<|#)/.test(text.trim())) continue;
    const chipped = new Set(
      [...text.matchAll(/\{([a-z][\w-]*)(?:\s+[\w-]+)?\}/g)].map((m) => m[1]!),
    );
    const plain = maskSpoken(text);
    for (const slugName of conceptSlugs) {
      if (chipped.has(slugName)) continue;
      // `{register-a}` already offers the register card; don't ask for a second.
      if (slugName === 'register' && [...chipped].some((c) => c.startsWith('register-'))) continue;
      if (slugName === 'flags' && [...chipped].some((c) => c.startsWith('flag-'))) continue;
      const terms = [slugName, ...(SYNONYMS[slugName] ?? [])];
      const hit = terms.find((t) => new RegExp(`\\b${t.replace(/[-\s]/g, '[-\\s]')}\\b`, 'i').test(plain));
      if (hit) {
        add(rel, bodyOffset + line, 'info', 'UNCHIPPED',
          `"${hit}" is named here with no {${slugName}} card in this block`);
      }
    }
  }

  // -- bare register / flag letters: a human decision -----------------------
  // A lone `A` is the English article as often as it is register A, so this can
  // never be a rule. It is a list to read.
  lines.forEach((raw, i) => {
    if (i < bodyOffset || /^\s*(-\s*\[|#|\||<)/.test(raw)) return;
    const plain = maskSpoken(raw);
    const hits = [...plain.matchAll(/(?<![\w*])([A-D]|[ESZ])(?![\w*])/g)].map((m) => m[1]!);
    if (hits.length) {
      add(rel, i + 1, 'info', 'BARE-LETTER',
        `bare ${[...new Set(hits)].join(' ')} — register/flag, or the word "A"?`);
    }
  });

  // -- the Bible's fixed page shape ----------------------------------------
  if (kind !== 'lesson') {
    const headings = [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]!.trim());
    // `Edge Cases` is the name the templates use; `Gotchas` is what the pages
    // written before the rename say. Both are accepted so the corpus can
    // migrate a page at a time instead of in one sweep — drop 'Gotchas' from
    // this pair once no page uses it (`grep -rl '^## Gotchas' docs/bible`).
    const wanted: (string | readonly string[])[] =
      kind === 'opcode'
        ? ['Simple', 'Advanced', 'Reads / Writes / Flags', ['Edge Cases', 'Gotchas'], 'See also']
        : ['Simple', 'Advanced', 'See also'];
    for (const w of wanted) {
      const names = typeof w === 'string' ? [w] : w;
      if (!names.some((n) => headings.includes(n))) {
        add(rel, 1, 'warn', 'SECTIONS',
          `no "## ${names[0]}" section — the Bible's page shape is ${wanted.map((x) => (typeof x === 'string' ? x : x[0])).join(' / ')}`);
      }
    }
    // A cross-link that points at nothing is a dead end in the reference.
    for (const m of body.matchAll(/\[[^\]]+\]\(((?:\.\.\/)?(opcodes|concepts)?\/?([A-Za-z0-9_-]+)\.md)\)/g)) {
      const href = m[1]!;
      const group = m[2];
      const target = m[3]!;
      const known =
        group === 'concepts'
          ? conceptSlugs.includes(target)
          : group === 'opcodes'
            ? opcodePages.some((o) => o.slug === target)
            : conceptSlugs.includes(target) || opcodePages.some((o) => o.slug === target);
      if (!known) {
        const line = bodyOffset + body.slice(0, m.index).split(String.fromCharCode(10)).length;
        add(rel, line, 'error', 'LINK-DEAD', `(${href}) points at no page`);
      }
    }
  }
}


// ---------------------------------------------------------------------------
// facts — the engine's own truth for one opcode, for the accuracy pass.
//
// Read this, not a sibling Bible page, before writing a word about an
// instruction. It prints what is DERIVABLE (the dictionary row) and points at
// what is not (the handler body), because guessing reads/writes/flags from a
// mnemonic is exactly how a page goes subtly wrong.
// ---------------------------------------------------------------------------
const TARGET_KINDS = ['ADR', 'JMP', 'CALL'];
const DIRECTION = ['outward (forward wins ties)', 'forward only', 'backward only'];
const REG = ['A', 'B', 'C', 'D'];

function facts(mnemonic: string) {
  const e = DICTIONARY.find((d) => d.mnemonic === mnemonic || d.gene === mnemonic);
  if (!e) {
    console.error(`no such instruction: ${mnemonic}`);
    process.exitCode = 1;
    return;
  }
  const takesTarget = TARGET_KINDS.includes(e.kind);
  console.log(`${e.mnemonic}  (gene: ${e.gene})   packages/engine/src/isa.ts`);
  console.log(`  id            ${e.id}`);
  console.log(`  decode kind   ${e.kind}`);
  console.log(`  handler       handlers.ts -> ${e.exec}()   <- READ THIS for reads/writes/flags`);
  console.log(`  registers     ${e.binding.length ? e.binding.map((i) => REG[i]).join(', ') : '(none bound)'}`);
  if (takesTarget) console.log(`  search dir    ${DIRECTION[e.dir] ?? e.dir}`);
  console.log('');
  console.log('  frontmatter these imply:');
  console.log(`    takes_target: ${takesTarget}`);
  console.log(`    bytes: ${takesTarget ? '1 + template' : '1'}`);
  console.log('');
  console.log('  NOT derivable — read the handler and write them down:');
  console.log('    reads:  writes:  flags_set:  can_error:');
  console.log('');
  console.log(`  grep -n "  ${e.exec}(" packages/engine/src/handlers.ts`);
}

// ---------------------------------------------------------------------------
// new — scaffold a page from templates/, with the machine facts pre-filled.
//
// The point is that nothing derivable is ever hand-typed. An existing page's
// authored choices (emoji, colour role) are carried forward, because
// regenerating a page should not silently restyle every chip that names it.
// ---------------------------------------------------------------------------
function scaffold(kind: string, slug: string) {
  const tpl = path.join(ROOT, '.claude/skills/tierra-docs/templates', `${kind}.md`);
  let out: string;
  try {
    out = readFileSync(tpl, 'utf8');
  } catch {
    console.error(`no template for kind "${kind}" (opcode | concept | lesson)`);
    process.exitCode = 1;
    return;
  }

  if (kind === 'opcode') {
    const e = DICTIONARY.find((d) => d.mnemonic === slug);
    if (!e) {
      console.error(`"${slug}" is not an engine mnemonic`);
      process.exitCode = 1;
      return;
    }
    const takesTarget = TARGET_KINDS.includes(e.kind);
    const existing = opcodePages.find((o) => o.slug === slug);
    out = out
      .replace(/«mnemonic»/g, e.mnemonic)
      .replace(/«display-name»/g, e.gene)
      .replace('«glyph»', existing?.emoji || '«glyph»')
      .replace('«action | register | marker | control | value»', existing?.category || '«action | register | marker | control | value»')
      .replace('«true | false»', String(takesTarget))
      .replace('«1 | 1 + template»', takesTarget ? '1 + template' : '1');
    console.log(`# scaffolded from the dictionary row for ${e.mnemonic} — now run:`);
    console.log(`#   doclint.ts facts ${e.mnemonic}`);
  } else if (kind === 'concept') {
    out = out.replace(/«slug»/g, slug);
  } else {
    out = out.replace(/«id»/g, slug);
  }

  const dir = kind === 'lesson' ? 'docs/lessons' : `docs/bible/${kind}s`;
  console.log(`# write to ${dir}/${slug}.md, then fill every «placeholder»
`);
  console.log(out);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
function vocab() {
  const line = (s = '') => console.log(s);
  line('TOKENS — every {name} that resolves, right now, on disk');
  line('');
  line(`  registers   ${REGISTER_IDS.map((r) => `{register-${r.toLowerCase()}}`).join(' ')}`);
  line(`  flags       ${FLAG_IDS.map((f) => `{flag-${f.toLowerCase()}}`).join(' ')}`);
  line('');
  line(`  concepts    (${conceptSlugs.length})  docs/bible/concepts/`);
  for (const s of conceptSlugs) {
    const syn = (SYNONYMS[s] ?? []).filter(isTarget);
    line(`    {${s}}${syn.length ? `   also said as: ${syn.map((w) => `{${s} ${w}}`).join(' ')}` : ''}`);
  }
  line('');
  line(`  opcodes     (${opcodePages.length})  by mnemonic OR display name`);
  for (const o of opcodePages) line(`    {${o.slug}}  =  {${o.name}}   ${o.emoji} ${o.category}`);
  line('');
  line('  a control opcode also takes the label it points at:  {jmpb top}  {adrb spot}');
  line('');
  line('TAGS — from packages/content/src/manifest.ts (the validator reads the same table)');
  line('');
  for (const [name, spec] of Object.entries(MANIFEST)) {
    const attrs = Object.entries(spec.attrs).map(([a, s]) => (s.required ? `${a}*` : a));
    const kids = Array.isArray(spec.children) ? spec.children.join('|') : spec.children;
    line(`  <${name}>`);
    line(`      ${spec.doc}`);
    line(`      children: ${kids}${spec.parents ? `   only inside: ${spec.parents.join('|')}` : ''}`);
    if (attrs.length) line(`      attrs: ${attrs.join(', ')}`);
  }
  line('');
  line(`  focus=       ${FOCUS_VALUES.join(' ')}`);
  line(`  run-until=   ${STAGE_CONDITIONS.join(' ')}`);
  line(`  Goal kind=   ${GOAL_KINDS.join(' ')}`);
  line('');
  line('RETIRED');
  for (const [t, why] of Object.entries(RETIRED_TAGS)) line(`  <${t}>  ${why}`);
}

function check(argv: string[]) {
  const targets = argv.length
    ? argv
    : [
        ...mdIn(OPCODES).map((f) => path.join('docs/bible/opcodes', f)),
        ...mdIn(CONCEPTS).map((f) => path.join('docs/bible/concepts', f)),
        ...mdIn(LESSONS).map((f) => path.join('docs/lessons', f)),
      ];

  for (const rel of targets) {
    const norm = rel.replace(/\\/g, '/');
    const kind = norm.includes('/opcodes/')
      ? 'opcode'
      : norm.includes('/concepts/')
        ? 'concept'
        : 'lesson';
    checkDoc(norm, kind, readFileSync(path.join(ROOT, rel), 'utf8'));
  }

  const rank = { error: 0, warn: 1, info: 2 } as const;
  const show = process.argv.includes('--all') ? findings : findings.filter((f) => f.severity !== 'info');
  show.sort((a, b) => rank[a.severity] - rank[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);

  for (const f of show) {
    const tag = f.severity === 'error' ? 'ERROR' : f.severity === 'warn' ? 'warn ' : 'info ';
    console.log(`${tag} ${f.file}:${f.line}  ${f.code}  ${f.message}`);
  }
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;
  const infos = findings.filter((f) => f.severity === 'info').length;
  console.log(
    `\n${targets.length} document(s): ${errors} error(s), ${warns} warning(s), ${infos} info` +
      (process.argv.includes('--all') ? '' : ' (--all to list info)'),
  );
  if (errors) process.exitCode = 1;
}

const cmd = process.argv[2];
if (cmd === 'vocab') vocab();
else if (cmd === 'check') check(process.argv.slice(3).filter((a) => !a.startsWith('--')));
else if (cmd === 'facts' && process.argv[3]) facts(process.argv[3]);
else if (cmd === 'new' && process.argv[3] && process.argv[4]) scaffold(process.argv[3], process.argv[4]);
else {
  console.log('usage: doclint.ts vocab');
  console.log('       doclint.ts check [path...] [--all]');
  console.log('       doclint.ts facts <mnemonic>');
  console.log('       doclint.ts new opcode|concept|lesson <slug>');
  process.exitCode = 2;
}
