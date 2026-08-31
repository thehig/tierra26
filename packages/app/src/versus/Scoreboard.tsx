// Live per-founder standings + the winner banner. Live populations come from the tank frames
// (lineage attribution); the winner comes from the authoritative match result. Supports N players.
import type { MatchResult } from '@tierra26/versus/types.ts';
import { FOUNDER_VAR } from '../design/palette.ts';

export function Scoreboard({
  names, live, cycle, threshold, thresholdKind, result, running,
}: {
  names: string[];
  live: Map<number, number>;
  cycle: number;
  threshold: number;
  thresholdKind: 'cycles' | 'generations';
  result: MatchResult | null;
  running: boolean;
}) {
  const rows = names.map((name, i) => ({ id: i + 1, name, pop: live.get(i + 1) ?? 0 }));
  const max = Math.max(1, ...rows.map((r) => r.pop));
  const pct = Math.min(100, Math.floor((cycle / Math.max(1, threshold)) * 100));
  const winnerLabel = !result ? null : result.winner === 'draw' ? 'Draw' : `${names[result.winner - 1] ?? `Player ${result.winner}`} wins!`;

  return (
    <div className="scoreboard">
      {rows.map((row) => (
        <div className="score-row" key={row.id}>
          <span className="sname" style={{ color: FOUNDER_VAR[row.id] ?? 'var(--ink)' }}>{row.name}</span>
          <span className="sbar"><span style={{ width: `${(row.pop / max) * 100}%`, background: FOUNDER_VAR[row.id] ?? 'var(--ink-2)' }} /></span>
          <span className="spop">{row.pop}</span>
        </div>
      ))}

      <div className="score-meta">
        <span className="sprog"><span style={{ width: `${pct}%` }} /></span>
        <span className="scyc">{cycle.toLocaleString()} / {threshold.toLocaleString()} {thresholdKind}</span>
      </div>

      {winnerLabel && (
        <div className={`winner ${result!.winner === 'draw' ? 'draw' : ''}`}>
          <span className="wlabel">{winnerLabel}</span>
          {result!.tiebreakerUsed && <span className="wtb">decided on {result!.tiebreakerUsed.replace(/-/g, ' ')}</span>}
        </div>
      )}
      {running && !result && <div className="score-note">running the match…</div>}
    </div>
  );
}
