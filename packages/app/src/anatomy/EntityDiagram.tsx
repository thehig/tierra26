// The oversized "anatomy of a creature" in its magnified world: the world grid (the creature, its
// daughter, its babies), the genome blocks (with the reading head), the four notebooks, flags,
// save-pile, daughter, and age. A `focus` (from scroll waypoints) spotlights one part at a time.
import { useEffect, useRef, useState } from 'react';
import { categoryVar } from '../design/palette.ts';
import type { EntityState } from './useMicroEngine.ts';

export type Focus = 'whole' | 'world' | 'genome' | 'registers' | 'ip' | 'flags' | 'age' | 'daughter' | 'run';

const REG_KEYS = ['A', 'B', 'C', 'D'] as const;
const FLAG_KEYS = ['E', 'S', 'Z'] as const;
const OWNER_CLASS = ['free', 'mother', 'daughter', 'baby'] as const;

export function EntityDiagram({
  state, focus, onStep, onReset, onRun, onPause, running = false, steps,
}: {
  state: EntityState;
  focus: Focus;
  onStep: () => void;
  onReset: () => void;
  onRun?: () => void;
  onPause?: () => void;
  running?: boolean;
  steps: number;
}) {
  const prevRegs = useRef(state.regs);
  const changed = { A: state.regs.A !== prevRegs.current.A, B: state.regs.B !== prevRegs.current.B, C: state.regs.C !== prevRegs.current.C, D: state.regs.D !== prevRegs.current.D };
  prevRegs.current = state.regs;

  // Block ↔ cell bridge: hovering a genome block rings its world cell, and vice-versa. Because the
  // creature sits at soup address 0, a block's address IS its world-cell index — they share a number.
  const [hovered, setHovered] = useState<number | null>(null);

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

  const dim = (part: Focus) => (focus !== 'whole' && focus !== 'run' && focus !== part ? 'dim' : '');
  const cols = Math.max(1, Math.round(Math.sqrt(state.worldSize)));

  return (
    <div className="entity-wrap">
    <div className={`entity focus-${focus}`}>
      <div className={`entity-world ${dim('world')} ${focus === 'world' ? 'lit' : ''}`} data-part="world">
        <div className="part-label">its world</div>
        <div className="world-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {state.world.map((o, i) => (
            <span key={i} className={`wcell ${OWNER_CLASS[o]} ${i === hovered ? 'link' : ''}`}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
          ))}
        </div>
      </div>

      <div className={`entity-genome ${dim('genome')} ${focus === 'ip' ? 'lit' : ''}`} data-part="genome">
        <div className="part-label">its genome — numbered instruction blocks</div>
        <div className="genome-blocks" ref={genomeRef}>
          {state.blocks.map((b) => (
            <div key={b.index} className="gline" ref={b.isIp ? ipRef : undefined}
              onMouseEnter={() => b.addr >= 0 && setHovered(b.addr)} onMouseLeave={() => setHovered(null)}>
              <span className="gaddr" title="this block's position in the code">{b.addr >= 0 ? b.addr : ''}</span>
              <div className={`gblock ${b.isLabel ? 'is-label' : ''} ${b.isIp ? 'is-ip' : ''} ${b.addr === hovered ? 'link' : ''}`}
                style={{ borderColor: categoryVar(b.category), color: categoryVar(b.category) }}>
                {b.isIp && <span className="reading-head" aria-label="reading head">▶</span>}
                <span className="gblock-text">{b.text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="entity-side">
        <div className={`entity-regs ${dim('registers')}`} data-part="registers">
          <div className="part-label">four notebooks</div>
          <div className="reg-cards">
            {REG_KEYS.map((k) => (
              <div className={`reg-card ${changed[k] ? 'changed' : ''}`} key={k}>
                <span className="reg-name">{k}</span><span className="reg-val">{state.regs[k]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`entity-flags ${dim('flags')}`} data-part="flags">
          <div className="part-label">flags</div>
          <div className="flag-chips">{FLAG_KEYS.map((f) => <span className={`flag-chip ${state.flags[f] ? 'on' : ''}`} key={f}>{f}</span>)}</div>
        </div>

        {(state.hasDaughter || state.population > 1) && (
          <div className={`entity-daughter ${dim('daughter')}`} data-part="daughter">
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

        <div className={`entity-vitals ${dim('age')}`} data-part="age">
          <span className="vital"><span className="vlabel">age</span><span className="vval">{state.age}</span></span>
          <span className="vital"><span className="vlabel">size</span><span className="vval">{state.size}</span></span>
          <span className="vital"><span className="vlabel">tick</span><span className="vval">{state.cycle}</span></span>
          <span className="vital"><span className="vlabel">alive</span><span className="vval">{state.population}</span></span>
        </div>
      </div>

      <div className={`entity-controls ${focus === 'run' ? 'lit' : ''}`}>
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
