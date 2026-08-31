// The "how's the tank doing" glance. Reads the frame's stats straight through.
import type { SessionState } from '../session/reduce.ts';

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

export function Hud({ state }: { state: SessionState }) {
  const s = state.frame?.stats;
  const rows: [string, string][] = [
    ['cycles', fmt(state.cycle)],
    ['population', s ? String(s.population) : '—'],
    ['genotypes', s ? String(s.genotypes) : '—'],
    ['births', s ? String(s.births) : String(state.births)],
    ['deaths', s ? String(s.deaths) : String(state.deaths)],
    ['fullness', s ? Math.floor((s.fullness ?? 0) * 100) + '%' : '—'],
    ['avg size', s && s.avgSize ? String(Math.round(s.avgSize)) : '—'],
  ];
  return (
    <div className="hud">
      <div className="hud-title">Readouts</div>
      <dl className="hud-grid">
        {rows.map(([k, v]) => (
          <div className="hud-cell" key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {state.error && <p className="hud-error">{state.error}</p>}
    </div>
  );
}
