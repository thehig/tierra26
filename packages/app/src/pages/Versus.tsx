// The Versus arena: two genome editors → one shared soup, injected simultaneously at cycle 0.
// The live tank + scoreboard run in the engine worker; the authoritative winner comes from the
// versus worker (runMatch). A share link round-trips the two genomes via the route's RunLink.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';
import { compile } from '@tierra26/genescript/comp.ts';
import { hasErrors } from '@tierra26/genescript/types.ts';
import { classic32 } from '@tierra26/engine/isa.ts';
import { normalizeScenario } from '@tierra26/engine';
import { routeToPath } from '@tierra26/ui/shell.ts';
import { buildDescriptor, toRunDescriptor } from '@tierra26/versus/runner.ts';
import type { MatchConfig, MatchDescriptor } from '@tierra26/versus/types.ts';
import { playerPopulations } from '@tierra26/versus/lineage.ts';
import { GeneEditor } from '../editor/GeneEditor.tsx';
import { TankCanvas } from '../ui/TankCanvas.tsx';
import { useSession } from '../session/useSession.ts';
import { useMatch, type MatchApi } from '../versus/useMatch.ts';
import { Scoreboard } from '../versus/Scoreboard.tsx';
import { useRouter } from '../router/router.tsx';

const THRESHOLD = 200_000;

function MatchStage({ desc, dark, threshold, match }: { desc: MatchDescriptor; dark: boolean; threshold: number; match: MatchApi }) {
  const boot = useMemo(() => { const r = toRunDescriptor(desc); return { scenario: r.scenario, injections: r.injections }; }, [desc]);
  const session = useSession(boot);
  const paused = useRef(false);

  useEffect(() => { session.play(); paused.current = false; /* run on mount */ // eslint-disable-next-line
  }, []);
  useEffect(() => {
    if (!paused.current && session.state.cycle >= threshold) { session.pause(); paused.current = true; }
  }, [session.state.cycle, threshold, session]);

  const live = session.state.frame ? playerPopulations(session.state.frame) : new Map<number, number>();
  return (
    <div className="match-stage">
      <div className="tankwrap"><TankCanvas frame={session.state.frame} dark={dark} /></div>
      <Scoreboard
        names={['Player A', 'Player B']}
        live={live}
        cycle={session.state.cycle}
        threshold={threshold}
        result={match.result}
        running={match.running}
      />
    </div>
  );
}

export function VersusPage({ dark }: { dark: boolean }) {
  const { route } = useRouter();
  const run = route?.surface === 'versus' ? route.run : undefined;
  const [srcA, setSrcA] = useState(run?.genomes?.[0] ?? ANCESTOR_GS);
  const [srcB, setSrcB] = useState(run?.genomes?.[1] ?? ANCESTOR_GS);
  const [seed, setSeed] = useState(run?.seed ?? 1);
  const [desc, setDesc] = useState<MatchDescriptor | null>(null);
  const [fightId, setFightId] = useState(0);
  const [copied, setCopied] = useState(false);
  const match = useMatch();

  const errA = useMemo(() => hasErrors(compile(srcA, classic32).diagnostics), [srcA]);
  const errB = useMemo(() => hasErrors(compile(srcB, classic32).diagnostics), [srcB]);
  const canFight = !errA && !errB;

  function fight() {
    if (!canFight) return;
    const cfg: MatchConfig = {
      scenario: normalizeScenario({ soupSize: 30000, mutation: { flaw: 0, copy: 0, cosmic: 0 } }),
      seed,
      players: [
        { founderId: 1, name: 'Player A', genome: srcA },
        { founderId: 2, name: 'Player B', genome: srcB },
      ],
      rules: { threshold: { kind: 'cycles', value: THRESHOLD }, tiebreakers: ['peak-population', 'total-births'] },
    };
    const d = buildDescriptor(cfg);
    setDesc(d);
    setFightId((n) => n + 1);
    match.run(d);
  }
  function reset() { setDesc(null); match.clear(); }
  function share() {
    const p = routeToPath({ surface: 'versus', run: { scenarioId: 'soup-small', seed, genomes: [srcA, srcB] } });
    try { navigator.clipboard?.writeText(location.origin + p); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* no clipboard */ }
  }

  return (
    <div className="page versus">
      <h1>Versus</h1>
      <p className="versus-lede">Drop two creatures into one soup at the same instant and watch them fight for the tank. Population at cycle {THRESHOLD.toLocaleString()} wins.</p>

      <div className="versus-editors">
        <GeneEditor value={srcA} onChange={setSrcA} title="Player A" />
        <GeneEditor value={srcB} onChange={setSrcB} title="Player B" />
      </div>

      <div className="versus-bar">
        <label className="seedin">seed <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} /></label>
        <button className="btn primary" disabled={!canFight} onClick={fight}>⚔ Fight!</button>
        <button className="btn" onClick={reset} disabled={!desc}>Reset</button>
        <button className="btn ghost" onClick={share}>{copied ? '✓ copied' : 'Copy share link'}</button>
        {!canFight && <span className="versus-err">{errA ? 'Player A' : 'Player B'} doesn't compile yet.</span>}
      </div>

      {desc && <MatchStage key={fightId} desc={desc} dark={dark} threshold={THRESHOLD} match={match} />}
    </div>
  );
}
