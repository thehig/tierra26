// A live playground for any PlaygroundConfig. `compact` (lesson/wiki embeds) shows
// tank + controls + readouts; the full form (sandbox) adds the editor and inspector.
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadFromGenome } from '@tierra26/ui/editor.ts';
import { classic32 } from '@tierra26/engine/isa.ts';
import type { PlaygroundConfig, Goal } from '@tierra26/content/types.ts';
import { STARTERS } from '@tierra26/content/lessons.ts';
import { useSession } from '../session/useSession.ts';
import { TankCanvas } from '../ui/TankCanvas.tsx';
import { Hud } from '../ui/Hud.tsx';
import { Controls } from '../ui/Controls.tsx';
import { Charts } from '../ui/Charts.tsx';
import { Inspector } from '../ui/Inspector.tsx';
import { GeneEditorLazy as GeneEditor } from '../editor/GeneEditorLazy.tsx';
import { resolvePlaygroundBoot } from './resolve.ts';
import { liveGoalStatus } from '../goal/liveGoal.ts';

function initialSource(cfg: PlaygroundConfig): string {
  return cfg.starter.kind === 'genescript' ? cfg.starter.source : (STARTERS[cfg.starter.id]?.source ?? '');
}

export function Playground({
  config, dark, compact = false, editable = false, goal, onGoalMet,
}: {
  config: PlaygroundConfig;
  dark: boolean;
  compact?: boolean;
  editable?: boolean; // compact embeds: reveal a collapsible editor that injects into THIS soup
  goal?: Goal;
  onGoalMet?: () => void;
}) {
  const boot = useMemo(() => resolvePlaygroundBoot(config), [config]);
  const session = useSession(boot);
  const [editorSource, setEditorSource] = useState<string>(() => initialSource(config));
  const [editing, setEditing] = useState(false);

  const status = goal ? liveGoalStatus(goal, session.state.frame) : null;
  const firedRef = useRef(false);
  useEffect(() => {
    if (status?.passed && !firedRef.current) { firedRef.current = true; onGoalMet?.(); }
  }, [status?.passed, onGoalMet]);

  if (compact) {
    return (
      <div className="playground compact">
        <Controls api={session} />
        <div className="tankwrap"><TankCanvas frame={session.state.frame} dark={dark} onPick={(a) => session.inspect(a)} /></div>
        <div className="pg-side">
          <Hud state={session.state} />
          <Charts frame={session.state.frame} />
        </div>
        {goal && status && (
          <div className={`goalstatus ${status.passed ? 'met' : ''}`}>
            <span className="gs-mark">{status.passed ? '✓' : '◦'}</span>
            <span className="gs-title">{goal.title}</span>
            {status.label && <span className="gs-measure">{status.measured} {status.label}</span>}
          </div>
        )}
        {editable && (
          <div className="pg-try">
            <button
              className="try-toggle"
              aria-expanded={editing}
              onClick={() => setEditing((e) => !e)}
            >
              {editing ? '▾' : '▸'} ✎ Try editing this creature
            </button>
            {editing && (
              <GeneEditor
                title="Try editing this creature"
                value={editorSource}
                onChange={setEditorSource}
                onInject={(b) => session.injectGenome(b)}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="playground">
      <Controls api={session} />
      <div className="pg-grid">
        <GeneEditor value={editorSource} onChange={setEditorSource} onInject={(b) => session.injectGenome(b)} />
        <div className="pg-center">
          <div className="tankwrap"><TankCanvas frame={session.state.frame} dark={dark} onPick={(a) => session.inspect(a)} /></div>
        </div>
        <div className="pg-side">
          <Hud state={session.state} />
          <Charts frame={session.state.frame} />
          <Inspector
            view={session.state.inspect}
            cycle={session.state.cycle}
            onOpenInEditor={(g) => setEditorSource(loadFromGenome(g, classic32).source)}
          />
        </div>
      </div>
    </div>
  );
}
