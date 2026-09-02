// The opcode-definition tooltip that pops from a hovered genome block. Compact and reuse-first: it
// resolves the block's gene to the existing per-opcode content — VOCAB (kid line, machine truth,
// category, mnemonic), the Bible page (the first `## Edge Cases` bullet, as the "watch out" line)
// and INSTRPAGE (the `targets` list of what changes, which a document cannot express).
import { entry } from '@tierra26/genescript/vocab.ts';
import { pageOf } from '@tierra26/content/instrpage.ts';
import type { AnimationSpec } from '@tierra26/content/types.ts';
import { opcodeEmoji } from './opcodeEmoji.ts';
import { categoryVar, type KeywordCategory } from '../design/palette.ts';
import { useLanguageMode } from '../design/languageMode.tsx';
import { simpleName } from '../design/bindings.ts';
import { opcodeDoc, firstEdgeCase } from '../doc/docs.ts';
import { Link } from '../router/router.tsx';

type Target = AnimationSpec['targets'][number];

// one "what changes" badge per target: a plain-language label + the colour role it belongs to
function describeTarget(t: Target): { label: string; cat: KeywordCategory } {
  switch (t.kind) {
    case 'register': {
      const verb = t.change === 'set' ? 'sets' : t.change === 'read' ? 'reads' : t.change === 'increase' ? 'grows' : 'shrinks';
      return { label: `${verb} ${t.reg}`, cat: 'register' };
    }
    case 'flag': return { label: `${t.change === 'set' ? 'sets' : 'clears'} flag ${t.flag}`, cat: 'value' };
    case 'stack': return { label: t.change === 'push' ? 'pushes the save-pile' : 'pops the save-pile', cat: 'marker' };
    case 'ip': return { label: t.change === 'jump' ? 'moves the reading head' : t.change === 'skip' ? 'may skip the next line' : t.change === 'call' ? 'calls (remembers where)' : 'returns', cat: 'control' };
    case 'cell': return { label: t.change === 'allocate' ? 'makes a daughter' : 'releases the daughter', cat: 'concept' };
    case 'soup': return { label: 'writes a cell', cat: 'action' };
  }
}

export function OpcodeTooltip({ gene, x, y, onEnter, onLeave }: { gene: string; x: number; y: number; onEnter?: () => void; onLeave?: () => void }) {
  const advanced = useLanguageMode() === 'advanced';
  const v = entry(gene);
  if (!v) return null;
  // advanced leads with the real mnemonic; simple leads with the friendly (bindings) name
  const name = advanced ? v.mnemonic : simpleName(v.verb);
  const sub = advanced ? simpleName(v.verb) : v.mnemonic;
  const page = pageOf(gene);
  const targets = page?.animation.targets ?? [];
  // The pitfall comes from the page's own Edge Cases, so the tooltip cannot
  // drift from the document the way a second authored copy did.
  const watch = firstEdgeCase(opcodeDoc(v.mnemonic));

  // fixed to the viewport, anchored to the row's right edge, clamped so it never runs off-screen
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(x + 12, vw - 320);
  const top = Math.min(Math.max(8, y - 8), vh - 260);

  return (
    <div className="op-tip" style={{ left, top }} role="tooltip" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="op-tip-head">
        <span className="op-tip-emoji" aria-hidden="true">{opcodeEmoji(gene)}</span>
        <span className="op-tip-name">{name}</span>
        <span className="op-tip-chip" style={{ background: categoryVar(v.category) }}>{v.category}</span>
        <span className="op-tip-mnem">{sub}</span>
      </div>
      <div className="op-tip-kid">{v.kid}</div>
      <code className="op-tip-machine">{v.machine}</code>
      {targets.length > 0 && (
        <>
          <div className="op-tip-sec">What changes</div>
          <div className="op-tip-badges">
            {targets.map((t, i) => {
              const d = describeTarget(t);
              return <span key={i} className="op-badge" style={{ borderColor: categoryVar(d.cat), color: categoryVar(d.cat) }}>{d.label}</span>;
            })}
          </div>
        </>
      )}
      {watch && <div className="op-tip-watch"><b>!</b><span>{watch}</span></div>}
      <div className="op-tip-more"><Link to={{ surface: 'bible', verb: v.verb }}>Read the full page →</Link></div>
    </div>
  );
}
