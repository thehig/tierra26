// The Versus arena: up to 4 genome editors → one shared soup, injected simultaneously at cycle 0.
// The live tank + scoreboard run in the engine worker; the authoritative winner comes from the
// versus worker (runMatch, incl. best-of-N). The full recipe round-trips via a VersusLink share URL.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';
import { compile } from '@tierra26/genescript/comp.ts';
import { hasErrors } from '@tierra26/genescript/types.ts';
import { classic32 } from '@tierra26/engine/isa.ts';
import { normalizeScenario } from '@tierra26/engine';
import { buildDescriptor, toRunDescriptor, serializeVersusLink, parseVersusLink } from '@tierra26/versus/runner.ts';
import type { MatchConfig, MatchDescriptor, Threshold, Tiebreaker } from '@tierra26/versus/types.ts';
import { playerPopulations } from '@tierra26/versus/lineage.ts';
import { GeneEditorLazy as GeneEditor } from '../editor/GeneEditorLazy.tsx';
import { TankCanvas } from '../ui/TankCanvas.tsx';
import { useSession } from '../session/useSession.ts';
import { useMatch, type MatchApi } from '../versus/useMatch.ts';
import { Scoreboard } from '../versus/Scoreboard.tsx';

const TIEBREAKERS: Tiebreaker[] = ['peak-population', 'total-births', 'smaller-avg-size'];
const INERT = 'here:\njump-back here';

interface Player { name: string; source: string }

function MatchStage({ desc, dark, players, match }: { desc: MatchDescriptor; dark: boolean; players: Player[]; match: MatchApi }) {
  const boot = useMemo(() => { const r = toRunDescriptor(desc); return { scenario: r.scenario, injections: r.injections }; }, [desc]);
  const session = useSession(boot);
  const paused = useRef(false);
  const th = desc.threshold;

  useEffect(() => { session.play(); paused.current = false; /* run on mount */ // eslint-disable-next-line
  }, []);
  useEffect(() => {
    const reached = th.kind === 'cycles'
      ? session.state.cycle >= th.value
      : (session.state.frame?.stats.generations ?? 0) >= th.value;
    if (!paused.current && reached) { session.pause(); paused.current = true; }
  }, [session.state.cycle, session.state.frame, th, session]);

  const live = session.state.frame ? playerPopulations(session.state.frame) : new Map<number, number>();
  return (
    <div className="match-stage">
      <div className="tankwrap"><TankCanvas frame={session.state.frame} dark={dark} colorBy="founder" /></div>
      <Scoreboard
        names={players.map((p) => p.name)}
        live={live}
        cycle={th.kind === 'cycles' ? session.state.cycle : (session.state.frame?.stats.generations ?? 0)}
        threshold={th.value}
        thresholdKind={th.kind}
        result={match.result}
        running={match.running}
      />
    </div>
  );
}

export function VersusPage({ dark }: { dark: boolean }) {
  const [players, setPlayers] = useState<Player[]>([
    { name: 'Player A', source: ANCESTOR_GS },
    { name: 'Player B', source: INERT },
  ]);
  const [seed, setSeed] = useState(1);
  const [thresholdKind, setThresholdKind] = useState<'cycles' | 'generations'>('cycles');
  const [thresholdValue, setThresholdValue] = useState(200_000);
  const [bestOf, setBestOf] = useState(1);
  const [desc, setDesc] = useState<MatchDescriptor | null>(null);
  const [fightId, setFightId] = useState(0);
  const [copied, setCopied] = useState(false);
  const match = useMatch();

  // Restore from a VersusLink share URL (?m=…).
  useEffect(() => {
    const m = new URLSearchParams(location.search).get('m');
    if (!m) return;
    const link = parseVersusLink(decodeURIComponent(m));
    if (!link) return;
    const d = link.match;
    setPlayers(d.players.map((p, i) => ({ name: `Player ${String.fromCharCode(65 + i)}`, source: p.genome })));
    setSeed(d.scenario.seed);
    setThresholdKind(d.threshold.kind);
    setThresholdValue(d.threshold.value);
    setBestOf(d.rules.bestOf?.seeds ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors = useMemo(() => players.map((p) => hasErrors(compile(p.source, classic32).diagnostics)), [players]);
  const firstBad = errors.findIndex((e) => e);
  const canFight = firstBad < 0 && players.length >= 2;

  function buildCfg(): MatchConfig {
    const threshold: Threshold = { kind: thresholdKind, value: thresholdValue } as Threshold;
    return {
      scenario: normalizeScenario({ soupSize: 30000, mutation: { flaw: 0, copy: 0, cosmic: 0 } }),
      seed,
      players: players.map((p, i) => ({ founderId: i + 1, name: p.name, genome: p.source })),
      rules: {
        threshold, tiebreakers: TIEBREAKERS,
        ...(bestOf > 1 ? { bestOf: { seeds: bestOf, rotate: true } } : {}),
      },
    };
  }
  function fight() {
    if (!canFight) return;
    const d = buildDescriptor(buildCfg());
    setDesc(d); setFightId((n) => n + 1); match.run(d);
  }
  function reset() { setDesc(null); match.clear(); }
  function share() {
    const d = desc ?? buildDescriptor(buildCfg());
    const url = location.origin + '/versus?m=' + encodeURIComponent(serializeVersusLink({ match: d }));
    try { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* no clipboard */ }
  }
  const setSource = (i: number, source: string) => setPlayers((ps) => ps.map((p, j) => (j === i ? { ...p, source } : p)));

  return (
    <div className="page versus">
      <h1>Versus</h1>
      <p className="versus-lede">Drop {players.length} creatures into one soup at the same instant and watch them fight for the tank. Highest population at the threshold wins.</p>

      <div className={`versus-editors n${players.length}`}>
        {players.map((p, i) => (
          <div className="versus-player" key={i}>
            <GeneEditor value={p.source} onChange={(s) => setSource(i, s)} title={p.name} />
            {players.length > 2 && <button className="btn ghost pl-remove" onClick={() => setPlayers((ps) => ps.filter((_, j) => j !== i))}>remove</button>}
          </div>
        ))}
      </div>

      <div className="versus-bar">
        {players.length < 4 && <button className="btn" onClick={() => setPlayers((ps) => [...ps, { name: `Player ${String.fromCharCode(65 + ps.length)}`, source: INERT }])}>+ player</button>}
        <label className="seedin">seed <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} /></label>
        <label className="seedin">
          until
          <select value={thresholdKind} onChange={(e) => setThresholdKind(e.target.value as 'cycles' | 'generations')}>
            <option value="cycles">cycles</option>
            <option value="generations">generations</option>
          </select>
          <input type="number" value={thresholdValue} onChange={(e) => setThresholdValue(Number(e.target.value) || 1)} style={{ width: 96 }} />
        </label>
        <label className="seedin">best-of <input type="number" min={1} max={9} value={bestOf} onChange={(e) => setBestOf(Math.max(1, Number(e.target.value) || 1))} style={{ width: 56 }} /></label>
        <button className="btn primary" disabled={!canFight} onClick={fight}>⚔ Fight!</button>
        <button className="btn" onClick={reset} disabled={!desc}>Reset</button>
        <button className="btn ghost" onClick={share}>{copied ? '✓ copied' : 'Copy share link'}</button>
        {firstBad >= 0 && <span className="versus-err">{players[firstBad]!.name} doesn't compile yet.</span>}
      </div>

      {desc && <MatchStage key={fightId} desc={desc} dark={dark} players={players} match={match} />}
    </div>
  );
}
