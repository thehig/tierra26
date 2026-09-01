// The oversized "anatomy of a creature" in its magnified world: the world grid (the creature, its
// daughter, its babies), the genome blocks (with the reading head), the four notebooks, flags,
// save-pile, daughter, and age. A `focus` (from scroll waypoints) spotlights one part at a time.
import { useEffect, useRef, useState } from 'react';
import { opcodeEmoji } from './opcodeEmoji.ts';
import { registerVar } from '../design/datasheet.ts';
import { GenomeBlockRow } from './GenomeBlockRow.tsx';
import { OpcodeTooltip } from './OpcodeTooltip.tsx';
import type { EntityState, GenomeBlock } from './useMicroEngine.ts';

export type Focus = 'whole' | 'world' | 'genome' | 'registers' | 'ip' | 'flags' | 'age' | 'daughter' | 'run';

const REG_KEYS = ['A', 'B', 'C', 'D'] as const;
const FLAG_KEYS = ['E', 'S', 'Z'] as const;
const OWNER_CLASS = ['free', 'mother', 'daughter', 'baby'] as const;

/** Whether a display affordance is forced on/off, or picked from the world size. */
export type Auto = 'on' | 'off' | 'auto';

export function EntityDiagram({
  state, focus, onStep, onReset, onRun, onPause, running = false, steps,
  emoji = 'auto', loupe: loupeMode = 'auto',
}: {
  state: EntityState;
  focus: Focus;
  onStep: () => void;
  onReset: () => void;
  onRun?: () => void;
  onPause?: () => void;
  running?: boolean;
  steps: number;
  /** Show each cell's opcode emoji in the world grid. 'auto' = small worlds only. */
  emoji?: Auto;
  /** Hover magnifier over the world grid. 'auto' = big worlds only. */
  loupe?: Auto;
}) {
  const prevRegs = useRef(state.regs);
  const changed = { A: state.regs.A !== prevRegs.current.A, B: state.regs.B !== prevRegs.current.B, C: state.regs.C !== prevRegs.current.C, D: state.regs.D !== prevRegs.current.D };
  prevRegs.current = state.regs;

  // Block ↔ cell bridge: hovering a genome block rings ALL the world cells it occupies, and hovering
  // any of those cells rings the block — as a byte RANGE, so a 2-byte op (opcode + payload) links
  // both cells to its rows. The creature sits at soup address 0, so cell index == byte address.
  const [hovered, setHovered] = useState<{ start: number; end: number } | null>(null);
  const rangeOfCell = (i: number) => {
    const b = state.blocks.find((bl) => bl.addr === i);
    return b ? { start: b.groupStart, end: b.groupStart + b.groupSpan } : { start: i, end: i + 1 };
  };
  const cellLit = (i: number) => hovered != null && i >= hovered.start && i < hovered.end;
  const blockLit = (b: GenomeBlock) => hovered != null && hovered.start === b.groupStart;
  const clearHover = () => setHovered(null);
  // Hovering the world raises a magnifier loupe: solid colours stay in the grid, but the cells under
  // the cursor are shown big, with each cell's opcode emoji inside its ownership-coloured border.
  const [loupe, setLoupe] = useState<{ cell: number; x: number; y: number } | null>(null);
  // Hovering a genome block pops its opcode-definition tooltip, anchored to the row (fixed position).
  // Leaving the row hides it after a short beat, so the cursor can cross into the card to click through.
  const [tip, setTip] = useState<{ gene: string; x: number; y: number } | null>(null);
  const tipHideRef = useRef(0);
  const onTip = (gene: string | null, rect: DOMRect | null) => {
    if (gene && rect) { clearTimeout(tipHideRef.current); setTip({ gene, x: rect.right, y: rect.top }); }
    else tipHideRef.current = window.setTimeout(() => setTip(null), 120);
  };

  // The genome list has a bounded height and scrolls internally (a real genome is dozens of blocks),
  // so keep the reading head in view — scrolling only the list, never the page.
  const genomeRef = useRef<HTMLDivElement | null>(null);
  const ipRef = useRef<HTMLDivElement | null>(null);
  const ipAddr = state.blocks.find((b) => b.isIp)?.addr ?? -1;
  useEffect(() => {
    const c = genomeRef.current, el = ipRef.current;
    if (!c || !el) return;
    const cr = c.getBoundingClientRect(), er = el.getBoundingClientRect();
    if (er.top < cr.top || er.bottom > cr.bottom) c.scrollTop += (er.top - cr.top) - (c.clientHeight - er.height) / 2;
  }, [ipAddr]);

  // A scroll waypoint HIGHLIGHTS one part (a ring) rather than dimming the rest — nothing ever looks
  // greyed-out/disabled. 'controls' covers the 'run' focus; 'ip' rings only the reading-head ▶ marker
  // (below), not the whole genome panel.
  const spot = (part: string) => {
    const on = part === 'controls' ? focus === 'run' : focus === part;
    return on ? 'spot' : '';
  };
  const cols = Math.max(1, Math.round(Math.sqrt(state.worldSize)));
  // A small tutorial world shows every opcode emoji right in the grid (no hover needed); a big world
  // (the ancestor) stays solid colours and reveals emoji under the hover magnifier. `auto` keeps that
  // rule; a document can override either independently (<EntityDesigner emoji="on" loupe="on">), which
  // is what makes the diagram instancable rather than implicitly sized.
  const small = state.worldSize <= 49;
  const showEmoji = emoji === 'auto' ? small : emoji === 'on';
  const showLoupe = loupeMode === 'auto' ? !small : loupeMode === 'on';

  return (
    <div className="entity-wrap">
    <div className={`entity focus-${focus}`}>
      <div className={`entity-world ${spot('world')}`} data-part="world">
        <div className="part-label">{showLoupe ? 'world · hover to inspect 🔍' : 'world'}</div>
        <div className={`world-grid ${showEmoji ? 'emoji' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          onMouseLeave={() => { clearHover(); setLoupe(null); }}>
          {state.world.map((o, i) => (
            <span key={i} className={`wcell ${OWNER_CLASS[o]} ${cellLit(i) ? 'link' : ''} ${i === ipAddr ? 'ip' : ''}`}
              onMouseMove={(e) => { setHovered(rangeOfCell(i)); if (showLoupe) setLoupe({ cell: i, x: e.clientX, y: e.clientY }); }}>
              {showEmoji ? opcodeEmoji(state.worldGene[i]) : null}
            </span>
          ))}
        </div>
        {/* the big world stays solid, so pin the magnifier under it, centred on the reading head — it
            follows the ▶ as you Step, showing the current instruction in context without hovering. */}
        {showLoupe && ipAddr >= 0 && (
          <div className="world-focus">
            <div className="part-label">reading head ▶</div>
            <div className="step-loupe"><LoupeView state={state} cols={cols} cell={ipAddr} rowR={1} /></div>
          </div>
        )}
      </div>
      {loupe && <WorldLoupe state={state} cols={cols} {...loupe} />}
      {tip && <OpcodeTooltip {...tip} onEnter={() => clearTimeout(tipHideRef.current)} onLeave={() => setTip(null)} />}

      <div className={`entity-genome ${spot('genome')}`} data-part="genome">
        <div className="part-label">genome</div>
        <div className="genome-blocks" ref={genomeRef}>
          {/* one row per byte == one world cell (1:1); GenomeBlockRow is the shared block definition */}
          {state.blocks.map((b) => (
            <GenomeBlockRow key={b.addr} block={b} lit={blockLit(b)} focusIp={focus === 'ip'}
              rowRef={b.isIp ? ipRef : undefined} onTip={onTip}
              onEnter={() => setHovered({ start: b.groupStart, end: b.groupStart + b.groupSpan })}
              onLeave={clearHover} />
          ))}
        </div>
      </div>

      <div className="entity-side">
        <div className={`entity-regs ${spot('registers')}`} data-part="registers">
          <div className="part-label">registers</div>
          <div className="reg-cards">
            {REG_KEYS.map((k) => (
              <div className={`reg-card ${changed[k] ? 'changed' : ''}`} key={k}>
                <span className="reg-name" style={{ color: registerVar(k) }}>{k}</span><span className="reg-val">{state.regs[k]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`entity-flags ${spot('flags')}`} data-part="flags">
          <div className="part-label">flags</div>
          <div className="flag-chips">{FLAG_KEYS.map((f) => <span className={`flag-chip ${state.flags[f] ? 'on' : ''}`} key={f}>{f}</span>)}</div>
        </div>

        {(state.hasDaughter || state.population > 1) && (
          <div className={`entity-daughter ${spot('daughter')}`} data-part="daughter">
            <div className="part-label">{state.population > 1 ? 'a baby was born! 🎉' : 'the daughter'}</div>
            <div className="dfill"><span style={{ width: `${state.daughterFillPct}%` }} /></div>
            <span className="dfill-pct">{state.daughterFillPct}% filled</span>
          </div>
        )}

        <div className="entity-pile" data-part="pile">
          <div className="part-label">save-pile</div>
          {state.stack.length === 0 ? <span className="pile-empty">empty</span>
            : <span className="pile-cells">{state.stack.map((v, i) => <span className="pile-cell" key={i}>{v}</span>)}</span>}
        </div>

        <div className={`entity-vitals ${spot('age')}`} data-part="age">
          <span className="vital"><span className="vlabel">age</span><span className="vval">{state.age}</span></span>
          <span className="vital"><span className="vlabel">size</span><span className="vval">{state.size}</span></span>
          <span className="vital"><span className="vlabel">tick</span><span className="vval">{state.cycle}</span></span>
          <span className="vital"><span className="vlabel">alive</span><span className="vval">{state.population}</span></span>
        </div>
      </div>

      <div className={`entity-controls ${spot('controls')}`}>
        <button className="btn primary" onClick={onStep} disabled={running || state.halted}>⇥ Step</button>
        {onRun && !state.halted && (running
          ? <button className="btn" onClick={onPause}>❚❚ Pause</button>
          : <button className="btn" onClick={onRun}>▶ Run</button>)}
        <button className="btn" onClick={onReset} disabled={steps === 0 && !running}>↺ Reset</button>
        <span className="entity-steps">
          {state.halted ? `finished after ${steps} tick${steps === 1 ? '' : 's'} — press ↺ Reset to run again`
            : steps === 0 ? 'press Step to run one instruction'
            : `${steps} tick${steps === 1 ? '' : 's'}`}
        </span>
      </div>
    </div>
    </div>
  );
}

// The magnifier body: the neighbourhood around a cell (rowR rows / colR cols each side of centre —
// 5×5 by default), each cell's opcode as an emoji inside its ownership-coloured border, with the
// centre cell's gene named below. Shared by the floating hover loupe and the inline reading-head
// inspector (which pins rowR=1 for a compact 3-row band).
function LoupeView({ state, cols, cell, rowR = 2, colR = 2 }: { state: EntityState; cols: number; cell: number; rowR?: number; colR?: number }) {
  const N = 2 * colR + 1;
  const rows = Math.ceil(state.worldSize / cols);
  const cr = Math.floor(cell / cols), cc = cell % cols;
  const cells: { idx: number; center: boolean }[] = [];
  for (let dr = -rowR; dr <= rowR; dr++) for (let dc = -colR; dc <= colR; dc++) {
    const rr = cr + dr, ccc = cc + dc;
    const inside = rr >= 0 && rr < rows && ccc >= 0 && ccc < cols;
    cells.push({ idx: inside ? rr * cols + ccc : -1, center: dr === 0 && dc === 0 });
  }
  const centerGene = state.worldGene[cell];
  return (
    <>
      <div className="wloupe-grid" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
        {cells.map((c, k) => {
          const owner = c.idx >= 0 ? state.world[c.idx]! : 0;
          const gene = c.idx >= 0 ? state.worldGene[c.idx]! : null;
          return <span key={k} className={`wl-cell ${OWNER_CLASS[owner]} ${c.center ? 'center' : ''} ${c.idx < 0 ? 'oob' : ''}`}>{opcodeEmoji(gene)}</span>;
        })}
      </div>
      <div className="wloupe-cap">{centerGene ? <code>{centerGene}</code> : 'empty space'}</div>
    </>
  );
}

// The floating magnifier that follows the cursor while hovering the big world.
function WorldLoupe({ state, cols, cell, x, y }: { state: EntityState; cols: number; cell: number; x: number; y: number }) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(x + 18, vw - 200);
  const top = Math.min(y + 18, vh - 220);
  return (
    <div className="wloupe" style={{ left, top }}>
      <LoupeView state={state} cols={cols} cell={cell} />
    </div>
  );
}
