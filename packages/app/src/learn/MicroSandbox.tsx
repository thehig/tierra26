// The "your turn" challenge: a small editor + the live creature diagram + step controls, with a
// goal checked off the micro-engine state each tick. Solving it (latched) marks the chapter done.
import { useEffect, useState } from 'react';
import { GeneEditorLazy as GeneEditor } from '../editor/GeneEditorLazy.tsx';
import { EntityDiagram } from '../anatomy/EntityDiagram.tsx';
import { useMicroEngine } from '../anatomy/useMicroEngine.ts';
import { checkMicroGoal, type Challenge } from './chapters.ts';

export function MicroSandbox({ challenge, onSolved }: { challenge: Challenge; onSolved?: () => void }) {
  const [source, setSource] = useState(challenge.starter);
  const micro = useMicroEngine(source);
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    if (!solved && !micro.state.compileError && checkMicroGoal(challenge.goal, micro.state)) {
      setSolved(true);
      onSolved?.();
    }
  }, [micro.state, solved, challenge.goal, onSolved]);

  return (
    <div className="micro-sandbox">
      <div className="ms-prompt"><span className="goaltag">Your turn</span> {challenge.prompt}</div>
      <div className="ms-grid">
        <GeneEditor value={source} onChange={setSource} title="your code" />
        <EntityDiagram state={micro.state} focus="run" onStep={micro.step} onReset={micro.reset} steps={micro.steps} />
      </div>
      <div className={`ms-goal ${solved ? 'met' : ''}`}>
        <span className="gs-mark">{solved ? '✓' : '◦'}</span>
        <span>{solved ? `Solved — ${challenge.goal.label}!` : challenge.goal.label}</span>
        {micro.state.compileError && <span className="ms-err">fix the code first</span>}
      </div>
    </div>
  );
}
