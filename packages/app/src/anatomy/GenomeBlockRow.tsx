// The canonical genome block — ONE row per byte, and the single definition used everywhere a genome
// is shown: the anatomy viewer (rich) and plain-text lists like the Inspector (`plain`). A row is a
// [block number] gutter + the block itself; the reading head is a HIGHLIGHT ON THE NUMBER, never a
// mark inside the block. Four block kinds read distinctly:
//   • label   — a signpost 🪧 landmark you jump to        (bold name)
//   • verb    — a friendly op, its category colour + emoji
//   • payload — a jump/find target, subordinate: ↳ + dashed, muted
//   • raw     — an exact opcode byte the source pinned: grey frame + 🔩 marker + the opcode emoji
import type { Ref } from 'react';
import { categoryVar } from '../design/palette.ts';
import { CONCEPT_EMOJI } from './opcodeEmoji.ts';
import type { GenomeBlock } from './useMicroEngine.ts';

// The data a row needs — a subset of GenomeBlock, so any producer (the micro-engine, a plain disasm
// row) can build one. `plain` rows only need addr/text/isIp.
export type BlockDatum = Pick<GenomeBlock, 'addr' | 'text' | 'emoji' | 'category' | 'isLabel' | 'isRaw' | 'isCont' | 'isIp'>;

export type BlockKind = 'label' | 'verb' | 'payload' | 'raw';
export function blockKind(b: Pick<GenomeBlock, 'isLabel' | 'isRaw' | 'isCont'>): BlockKind {
  return b.isLabel ? 'label' : b.isCont ? 'payload' : b.isRaw ? 'raw' : 'verb';
}

export function GenomeBlockRow({
  block, plain = false, lit = false, focusIp = false, onEnter, onLeave, rowRef,
}: {
  block: BlockDatum;
  plain?: boolean;      // a compact text row (no frame/emoji) — the plain-text genome display
  lit?: boolean;        // block ↔ world-cell hover link
  focusIp?: boolean;    // the 'ip' scroll waypoint — rings the reading head's number
  onEnter?: () => void;
  onLeave?: () => void;
  rowRef?: Ref<HTMLDivElement>;
}) {
  const { addr, text, emoji, category, isLabel, isRaw, isCont, isIp } = block;
  const kind = blockKind(block);
  // the reading head lives on the block NUMBER (accent pill); the 'ip' waypoint adds a ring on top.
  const addrCls = `gaddr ${isIp ? 'is-ip' : ''} ${isIp && focusIp ? 'spot' : ''}`;
  const num = <span className={addrCls} title="this cell’s position in the code">{addr >= 0 ? addr : ''}</span>;

  if (plain) {
    return (
      <div className={`gline plain ${isIp ? 'is-ip' : ''}`} ref={rowRef} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        {num}<span className="gblock-text">{text}</span>
      </div>
    );
  }

  // raw blocks wear a neutral grey frame (set in CSS); every other kind takes its category colour.
  const col = isRaw ? undefined : { borderColor: categoryVar(category), color: categoryVar(category) };
  // a label is shown by its signpost, not the nop mark underneath it; other kinds keep the opcode emoji.
  const glyph = isLabel ? CONCEPT_EMOJI.label : emoji;
  return (
    <div className={`gline ${isIp ? 'is-ip' : ''}`} ref={rowRef} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {num}
      <div className={`gblock is-${kind} ${lit ? 'link' : ''}`} style={col}>
        {isCont && <span className="gblock-lead gpay-arrow" aria-hidden="true">↳</span>}
        {isRaw && <span className="gblock-lead graw" title="an exact opcode byte, written `raw` in the source" aria-label="raw">{CONCEPT_EMOJI.raw}</span>}
        <span className="gblock-emoji" aria-hidden="true">{glyph}</span>
        <span className={`gblock-text ${isCont ? 'gpay-text' : ''}`}>{text}</span>
      </div>
    </div>
  );
}
