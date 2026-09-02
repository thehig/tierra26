// MiniMark — the small markdown subset a tierra26 document is written in.
//
// Deliberately not a markdown library. Two reasons: the pure packages take no
// dependencies, and the inline grammar is not standard markdown anyway — it
// carries {token} references to every named part of the machine.
//
// The inline scan is NOT reimplemented here: it calls the parser's own
// `splitInline`, which is also what the validator walks. So a construct that
// validated is a construct that renders, and adding an inline form is a change
// in one place.
//
// Block grammar: ATX headings, paragraphs, `-`/`*` and `1.` lists, fenced code,
// `>` blockquotes, `---` rules. No tables — no Bible page uses one.
import type { ReactNode } from 'react';
import { resolveToken, splitInline } from '@tierra26/content/doclang.ts';
import { entry, entryOfMnemonic, isVerb, mnemonicToVerb } from '@tierra26/genescript/vocab.ts';
import { CONCEPT_BINDINGS } from '../design/bindings.ts';
import { Chip } from './Chip.tsx';
import { Link } from '../router/router.tsx';

// The renderer resolves a {token} with the SAME function the validator used, so
// what passed the build is what paints. Its two lookups are the app's own
// registries: the engine vocabulary, and the concepts the Bible defines.
const TOKENS = {
  isOpcode: (t: string) => isVerb(t) || mnemonicToVerb(t) !== undefined,
  hasConcept: (s: string) => s in CONCEPT_BINDINGS,
};

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

/** `**strong**` and `*em*` over a plain text run. Split first so the emphasis
 *  scan never sees a chip or a code span. */
function emphasise(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${key}s${m.index}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('[')) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      out.push(<DocLink key={`${key}l${m.index}`} href={href!} label={label!} />);
    } else out.push(<em key={`${key}e${m.index}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A markdown link. Bible pages cross-link with relative paths
 *  (`[mal](mal.md)`, `[soup](../concepts/soup.md)`), which resolve to app routes
 *  through the normal router Link — so they behave like every other link in the
 *  app (meta/ctrl-click, scroll reset, history).  */
function DocLink({ href, label }: { href: string; label: string }) {
  const m = /(?:^|\/)(?:(opcodes|concepts)\/)?([A-Za-z0-9_-]+)\.md$/.exec(href);
  if (m) {
    const group = m[1];
    const slug = m[2]!;
    return group === 'concepts' ? (
      <Link className="instr-link" to={{ surface: 'concept', slug }}>
        {label}
      </Link>
    ) : (
      <Link className="instr-link" to={{ surface: 'wiki', verb: slug }}>
        {label}
      </Link>
    );
  }
  const external = /^https?:/.test(href);
  return (
    <a className="instr-link" href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
      {label}
    </a>
  );
}

/** Render one line/run of inline content. */
export function Inline({ text, keyPrefix = '' }: { text: string; keyPrefix?: string }) {
  return (
    <>
      {splitInline(text).map((seg, i) => {
        const k = `${keyPrefix}${i}`;
        switch (seg.kind) {
          case 'text':
            return <span key={k}>{emphasise(seg.text, k)}</span>;
          case 'code': {
            // A backticked token that names a real instruction becomes a chip, so
            // `incA` in prose and <Chip opcode="incA"/> look the same. Documents are
            // authored in MNEMONICS, so check that spelling too — otherwise every
            // `mal` in the Bible would render as plain code while <Chip> next to it
            // rendered as a chip.
            const v = entryOfMnemonic(seg.text) ?? entry(seg.text);
            if (v) return <Chip key={k} opcode={v.mnemonic} />;
            return (
              <code key={k} className="rt-code">
                {seg.text}
              </code>
            );
          }
          case 'token': {
            // {incA} {jmpb top} {register-a} {flag-e} {save-pile} — one syntax
            // for every named part of the machine. Validation rejects a token
            // that resolves to nothing, so in a document this always lands.
            const r = resolveToken(seg.token, TOKENS);
            if (!r) return <code key={k} className="rt-code">{seg.token}</code>;
            if (r.kind === 'register') return <Chip key={k} register={r.id} />;
            if (r.kind === 'flag') return <Chip key={k} flag={r.id} />;
            if (r.kind === 'concept') return <Chip key={k} concept={r.slug} />;
            return (
              <Chip key={k} opcode={r.name}>
                {seg.target}
              </Chip>
            );
          }
        }
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' };

export function toBlocks(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const out: Block[] = [];
  let i = 0;

  const paraBuf: string[] = [];
  const flushPara = () => {
    if (paraBuf.length) {
      out.push({ kind: 'para', text: paraBuf.join(' ') });
      paraBuf.length = 0;
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === '') {
      flushPara();
      i++;
      continue;
    }

    const fence = /^```(\w*)\s*$/.exec(trimmed);
    if (fence) {
      flushPara();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!.trim())) body.push(lines[i]!), i++;
      i++; // closing fence
      out.push({ kind: 'code', lang: fence[1] ?? '', text: body.join('\n') });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      out.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]! });
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushPara();
      out.push({ kind: 'rule' });
      i++;
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i]!.trim();
        const b = ordered ? /^\d+\.\s+(.*)$/.exec(t) : /^[-*]\s+(.*)$/.exec(t);
        if (b) {
          items.push(b[1]!);
          i++;
          continue;
        }
        // a wrapped continuation line belongs to the item above it
        if (t !== '' && items.length && /^\s{2,}/.test(lines[i]!)) {
          items[items.length - 1] += ' ' + t;
          i++;
          continue;
        }
        break;
      }
      out.push({ kind: 'list', ordered, items });
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushPara();
      const body: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('>')) {
        body.push(lines[i]!.trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push({ kind: 'quote', text: body.join(' ') });
      continue;
    }

    paraBuf.push(trimmed);
    i++;
  }
  flushPara();
  return out;
}

export function MiniMark({
  markdown,
  skipLeadingHeading = false,
}: {
  markdown: string;
  /** Drop a leading top-level heading. A Bible body opens with `# mal`, and the
   *  page around it has already rendered a styled, language-mode-aware title. */
  skipLeadingHeading?: boolean;
}) {
  let blocks = toBlocks(markdown);
  if (skipLeadingHeading && blocks[0]?.kind === 'heading' && blocks[0].level === 1) {
    blocks = blocks.slice(1);
  }
  return (
    <>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.kind) {
          case 'heading': {
            const H = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const)[b.level - 1] ?? 'h6';
            return (
              <H key={k} className="mm-h">
                <Inline text={b.text} keyPrefix={k} />
              </H>
            );
          }
          case 'para':
            return (
              <p key={k} className="prose">
                <Inline text={b.text} keyPrefix={k} />
              </p>
            );
          case 'list': {
            const L = b.ordered ? 'ol' : 'ul';
            return (
              <L key={k} className="mm-list">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it} keyPrefix={`${k}i${j}`} />
                  </li>
                ))}
              </L>
            );
          }
          case 'code':
            return (
              <pre key={k} className="mm-code">
                <code>{b.text}</code>
              </pre>
            );
          case 'quote':
            return (
              <blockquote key={k} className="mm-quote">
                <Inline text={b.text} keyPrefix={k} />
              </blockquote>
            );
          case 'rule':
            return <hr key={k} className="mm-rule" />;
        }
      })}
    </>
  );
}
