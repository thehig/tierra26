// The oversized "anatomy of a creature": its genome blocks (with the reading head), its four
// notebooks (registers), its flags, its save-pile, and its age — all big and friendly. A `focus`
// (driven by scroll waypoints) spotlights one part at a time. Step controls run it tick by tick.
import { useRef } from 'react';
import { categoryVar } from '../design/palette.ts';
import type { EntityState } from './useMicroEngine.ts';

export type Focus = 'whole' | 'genome' | 'registers' | 'ip' | 'flags' | 'age' | 'run';

const REG_KEYS = ['A', 'B', 'C', 'D'] as const;
const FLAG_KEYS = ['E', 'S', 'Z'] as const;

export function EntityDiagram({
  state, focus, onStep, onReset, steps,
}: {
  state: EntityState;
  focus: Focus;
  onStep: () => void;
  onReset: () => void;
  steps: number;
}) {
  const prevRegs = useRef(state.regs);
  const changed = (k: (typeof REG_KEYS)[number]) => state.regs[k] !== prevRegs.current[k];
  const wasChanged = { A: changed('A'), B: changed('B'), C: changed('C'), D: changed('D') };
  prevRegs.current = state.regs;

  const dim = (part: Focus) => (focus !== 'whole' && focus !== 'run' && focus !== part ? 'dim' : '');

  return (
    <div className={`entity focus-${focus}`}>
      <div className={`entity-genome ${dim('genome')} ${focus === 'ip' ? 'lit' : ''}`} data-part="genome">
        <div className="part-label">its genome — a stack of instruction blocks</div>
        <div className="genome-blocks">
          {state.blocks.map((b) => (
            <div
              key={b.index}
              className={`gblock ${b.isLabel ? 'is-label' : ''} ${b.isIp ? 'is-ip' : ''}`}
              style={{ borderColor: categoryVar(b.category), color: categoryVar(b.category) }}
            >
              {b.isIp && <span className="reading-head" aria-label="reading head">▶</span>}
              <span className="gblock-text">{b.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="entity-side">
        <div className={`entity-regs ${dim('registers')}`} data-part="registers">
          <div className="part-label">four notebooks</div>
          <div className="reg-cards">
            {REG_KEYS.map((k) => (
              <div className={`reg-card ${wasChanged[k] ? 'changed' : ''}`} key={k}>
                <span className="reg-name">{k}</span>
                <span className="reg-val">{state.regs[k]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={`entity-flags ${dim('flags')}`} data-part="flags">
          <div className="part-label">flags</div>
          <div className="flag-chips">
            {FLAG_KEYS.map((f) => (
              <span className={`flag-chip ${state.flags[f] ? 'on' : ''}`} key={f}>{f}</span>
            ))}
          </div>
        </div>

        <div className="entity-pile" data-part="pile">
          <div className="part-label">save-pile</div>
          {state.stack.length === 0
            ? <span className="pile-empty">empty</span>
            : <span className="pile-cells">{state.stack.map((v, i) => <span className="pile-cell" key={i}>{v}</span>)}</span>}
        </div>

        <div className={`entity-vitals ${dim('age')}`} data-part="age">
          <span className="vital"><span className="vlabel">age</span><span className="vval">{state.age}</span></span>
          <span className="vital"><span className="vlabel">size</span><span className="vval">{state.size}</span></span>
          <span className="vital"><span className="vlabel">tick</span><span className="vval">{state.cycle}</span></span>
        </div>
      </div>

      <div className={`entity-controls ${focus === 'run' ? 'lit' : ''}`}>
        <button className="btn primary" onClick={onStep}>⇥ Step one tick</button>
        <button className="btn" onClick={onReset} disabled={steps === 0}>↺ Reset</button>
        <span className="entity-steps">{steps === 0 ? 'press Step to run one instruction' : `${steps} tick${steps === 1 ? '' : 's'} run`}</span>
      </div>
    </div>
  );
}
