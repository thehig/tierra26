// The hover card for a chip that is not an instruction — a register, a flag, a
// concept.
//
// Same shell as OpcodeTooltip (.op-tip), so every chip in a sentence opens the
// same kind of card. The body comes from the Bible: this is what the original
// design meant by "the definition files are also the tooltips". The Simple
// section is shown in simple mode and Advanced in advanced mode, and the footer
// links to the full page.
//
// Renders the section as PLAIN TEXT rather than through MiniMark. Two reasons: a
// hover card wants one tight paragraph, not a heading tree; and MiniMark renders
// chips, which would nest a chip inside the card a chip just opened.
import { conceptDoc, plainText, tooltipMarkdown } from './docs.ts';
import { useLanguageMode } from '../design/languageMode.tsx';
import { Link } from '../router/router.tsx';

export function TokenTooltip({
  title,
  color,
  kid,
  slug,
  anchor,
  onEnter,
  onLeave,
}: {
  title: string;
  color: string;
  /** Shown when the Bible has no page for `slug`. */
  kid?: string;
  /** The concept page this token is explained on. */
  slug: string;
  anchor: { x: number; y: number };
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  const advanced = useLanguageMode() === 'advanced';
  const doc = conceptDoc(slug);
  const body = plainText(tooltipMarkdown(doc, advanced) ?? '') || kid || '';

  // Fixed to the viewport and clamped, exactly as OpcodeTooltip is.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(anchor.x + 12, vw - 320);
  const top = Math.min(Math.max(8, anchor.y - 8), vh - 200);

  return (
    <div
      className="op-tip"
      style={{ left, top }}
      role="tooltip"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="op-tip-head">
        <span className="op-tip-name" style={{ color }}>{title}</span>
      </div>
      {body && <div className="op-tip-kid">{body}</div>}
      {kid && body !== kid && <code className="op-tip-machine">{kid}</code>}
      {doc && (
        <div className="op-tip-more">
          <Link to={{ surface: 'concept', slug }}>Read the full page →</Link>
        </div>
      )}
    </div>
  );
}
