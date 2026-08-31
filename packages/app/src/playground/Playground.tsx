// The first slice, whole: a live worker session with the editor, tank, inspector, and
// charts composed around it. Editor edits a buffer and injects into the running soup;
// clicking a creature inspects it; "open in editor" round-trips a live genome back to code.
import { useState } from 'react';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';
import { loadFromGenome } from '@tierra26/ui/editor.ts';
import { classic32 } from '@tierra26/engine/isa.ts';
import { useSession } from '../session/useSession.ts';
import { TankCanvas } from '../ui/TankCanvas.tsx';
import { Hud } from '../ui/Hud.tsx';
import { Controls } from '../ui/Controls.tsx';
import { Charts } from '../ui/Charts.tsx';
import { Inspector } from '../ui/Inspector.tsx';
import { GeneEditor } from '../editor/GeneEditor.tsx';

export function Playground({ dark }: { dark: boolean }) {
  const session = useSession({ seed: 1, soupSize: 30000, source: ANCESTOR_GS });
  const [editorSource, setEditorSource] = useState<string>(ANCESTOR_GS);

  return (
    <div className="playground">
      <Controls api={session} />
      <div className="pg-grid">
        <GeneEditor value={editorSource} onChange={setEditorSource} onInject={(b) => session.injectGenome(b)} />
        <div className="pg-center">
          <div className="tankwrap">
            <TankCanvas frame={session.state.frame} dark={dark} onPick={(a) => session.inspect(a)} />
          </div>
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
