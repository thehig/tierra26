// Live per-founder standings + the winner banner. Live populations come from the tank
// frames (lineage attribution); the winner comes from the authoritative match result.
import type { MatchResult } from '@tierra26/versus/types.ts';

const FOUNDER_COLOR: Record<number, string> = { 1: 'var(--kw-register)', 2: 'var(--kw-action)' };

export function Scoreboard({
  names, live, cycle, threshold, result, running,
}: {
  names: [string, string];
  live: Map<number, number>;
  cycle: number;
  threshold: number;
  result: MatchResult | null;
  running: boolean;
}) {
  const a = live.get(1) ?? 0;
  const b = live.get(2) ?? 0;
  const max = Math.max(1, a, b);
  const pct = Math.min(100, Math.floor((cycle / threshold) * 100));

  const winnerLabel =
    !result ? null : result.winner === 'draw' ? 'Draw' : `${names[result.winner === 1 ? 0 : 1]} wins!`;

  return (
    <div className="scoreboard">
      {[{ id: 1, name: names[0], pop: a }, { id: 2, name: names[1], pop: b }].map((row) => (
        <div className="score-row" key={row.id}>
          <span className="sname" style={{ color: FOUNDER_COLOR[row.id] }}>{row.name}</span>
          <span className="sbar"><span style={{ width: `${(row.pop / max) * 100}%`, background: FOUNDER_COLOR[row.id] }} /></span>
          <span className="spop">{row.pop}</span>
        </div>
      ))}

      <div className="score-meta">
        <span className="sprog"><span style={{ width: `${pct}%` }} /></span>
        <span className="scyc">{cycle.toLocaleString()} / {threshold.toLocaleString()} cycles</span>
      </div>

      {winnerLabel && (
        <div className={`winner ${result!.winner === 'draw' ? 'draw' : ''}`}>
          <span className="wlabel">{winnerLabel}</span>
          {result!.tiebreakerUsed && <span className="wtb">decided on {result!.tiebreakerUsed.replace('-', ' ')}</span>}
        </div>
      )}
      {running && !result && <div className="score-note">running the match…</div>}
    </div>
  );
}
