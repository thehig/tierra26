// A live playground for any PlaygroundConfig. `compact` (lesson/wiki embeds) shows
// tank + controls + readouts; the full form (sandbox) adds the editor and inspector.
import { useMemo, useState } from 'react';
import { loadFromGenome } from '@tierra26/ui/editor.ts';
import { classic32 } from '@tierra26/engine/isa.ts';
import type { PlaygroundConfig } from '@tierra26/content/types.ts';
import { STARTERS } from '@tierra26/content/lessons.ts';
import { useSession } from '../session/useSession.ts';
import { TankCanvas } from '../ui/TankCanvas.tsx';
import { Hud } from '../ui/Hud.tsx';
import { Controls } from '../ui/Controls.tsx';
import { Charts } from '../ui/Charts.tsx';
import { Inspector } from '../ui/Inspector.tsx';
import { GeneEditor } from '../editor/GeneEditor.tsx';
import { resolvePlaygroundBoot } from './resolve.ts';

function initialSource(cfg: PlaygroundConfig): string {
  return cfg.starter.kind === 'genescript' ? cfg.starter.source : (STARTERS[cfg.starter.id]?.source ?? '');
}

export function Playground({ config, dark, compact = false }: { config: PlaygroundConfig; dark: boolean; compact?: boolean }) {
  const boot = useMemo(() => resolvePlaygroundBoot(config), [config]);
  const session = useSession(boot);
  const [editorSource, setEditorSource] = useState<string>(() => initialSource(config));

  if (compact) {
    return (
      <div className="playground compact">
        <Controls api={session} />
        <div className="tankwrap"><TankCanvas frame={session.state.frame} dark={dark} onPick={(a) => session.inspect(a)} /></div>
        <div className="pg-side"><Hud state={session.state} /><Charts frame={session.state.frame} /></div>
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
