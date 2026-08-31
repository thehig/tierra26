import { useMemo, useState } from 'react';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';
import type { PlaygroundConfig } from '@tierra26/content/types.ts';
import { routeToPath } from '@tierra26/ui/shell.ts';
import { Playground } from '../playground/Playground.tsx';
import { useRouter } from '../router/router.tsx';

export function SandboxPage({ dark }: { dark: boolean }) {
  const { route } = useRouter();
  const run = route?.surface === 'sandbox' ? route.run : undefined;
  const [copied, setCopied] = useState(false);

  // The recipe: from the share link (RunLink) if present, else the ancestor. Memoized so the
  // playground boots once per recipe (stable identity).
  const config = useMemo<PlaygroundConfig>(() => ({
    scenario: run?.scenarioId ?? 'soup-small',
    seed: run?.seed ?? 1,
    starter: { kind: 'genescript', source: run?.genomes?.[0] ?? ANCESTOR_GS },
    subset: { kind: 'classic32' },
  }), [run?.scenarioId, run?.seed, run?.genomes]);

  function share() {
    const source = config.starter.kind === 'genescript' ? config.starter.source : ANCESTOR_GS;
    const path = routeToPath({ surface: 'sandbox', run: { scenarioId: String(config.scenario), seed: config.seed, genomes: [source] } });
    try { navigator.clipboard?.writeText(location.origin + path); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* no clipboard */ }
  }

  return (
    <div className="page sandbox">
      <div className="sandbox-bar">
        <span className="freeplay">✦ free play · all instructions unlocked</span>
        <button className="btn ghost" onClick={share}>{copied ? '✓ copied' : 'Copy share link'}</button>
      </div>
      <Playground config={config} dark={dark} />
    </div>
  );
}
