// <EntityDesigner> — the instancable creature stage.
//
// One tag covers what used to be three hard-coded arrangements: the read-only
// anatomy diagram, the same diagram parked at an authored starting state, and
// the editable micro-sandbox. What varies is now authored, not compiled in:
//
//   <EntityDesigner soup="36" emoji="on" loupe="off" editable>
//     <Genome ref="ancestor" />                  (or inline mnemonics)
//     <State a="3" b="1" flags="[Z]" ip="2" />
//     <Goal kind="regAtLeast" reg="A" value="3" label="A reaches 3" />
//   </EntityDesigner>
//
// Genomes are authored in REAL MNEMONICS (incA, jmpb) — the engine's own
// identities. `toGeneSource` swaps them to the gene form the compiler takes, so
// what a document stores and what a learner reads can differ without the
// compiler ever seeing a friendly name.
import { useEffect, useMemo, useState } from 'react';
import { EntityDiagram, type Auto, type Focus } from '../../anatomy/EntityDiagram.tsx';
import { useMicroEngine } from '../../anatomy/useMicroEngine.ts';
import { attr, geneTextOf, genomeSourceOf, goalOf, initialStateOf, stateOf } from '../readers.ts';
import { GeneEditorLazy } from '../../editor/GeneEditorLazy.tsx';
import { LanguageModeFixed } from '../../design/languageMode.tsx';
import { checkMicroGoal } from '../../learn/chapters.ts';
import type { DocComponentProps } from '../DocRenderer.tsx';
import { useStageAdvance, useStageFocus, useStageOverrides } from './ScrollyTag.tsx';
import { GoalChip } from './ChallengeTag.tsx';

export function EntityDesignerTag({ node, ctx }: DocComponentProps) {
  const soup = attr.int(node, 'soup', 36);
  const editable = attr.bool(node, 'editable');
  const emoji = attr.str(node, 'emoji', 'auto') as Auto;
  const loupe = attr.str(node, 'loupe', 'auto') as Auto;
  const mode = attr.str(node, 'mode', 'follow');

  const goal = useMemo(() => goalOf(node), [node]);

  // A waypoint being read may replace what the stage shows — its own <Genome> or
  // <State> wins for as long as it is centred, so one Scrolly can walk a learner
  // through several creatures, or the same creature from several starting states.
  const override = useStageOverrides();
  const authored = useMemo(
    () => (override.genome ? geneTextOf(override.genome) : genomeSourceOf(node)),
    [node, override.genome],
  );
  const initial = useMemo(
    () => (override.state ? stateOf(override.state) : initialStateOf(node)),
    [node, override.state],
  );

  // An editable designer owns its source; a read-only one mirrors the document,
  // so re-authoring the markdown updates the stage on hot reload.
  const [source, setSource] = useState(authored);
  useEffect(() => setSource(authored), [authored]);

  const micro = useMicroEngine(editable ? source : authored, soup, initial);

  // Scroll waypoints drive the stage: `focus` rings one part, `at` parks the demo
  // on an exact tick, and `run-until` advances it to the moment something happens
  // — so a waypoint can talk about an event without the author counting ticks.
  const focus = useStageFocus() as Focus;
  const advance = useStageAdvance();
  const { stepTo, runUntil } = micro;
  useEffect(() => {
    if (!advance) return;
    if (advance.until) runUntil(advance.until);
    else if (advance.at !== undefined) stepTo(advance.at);
  }, [advance?.at, advance?.until, stepTo, runUntil]);

  // Live goal checking, latched: once met it stays met, so a value the creature
  // merely passes through cannot un-solve itself on the next tick.
  const [solved, setSolved] = useState(false);
  useEffect(() => {
    if (!goal || solved || micro.state.compileError) return;
    if (checkMicroGoal(goal.micro, micro.state)) {
      setSolved(true);
      ctx.onGoalMet?.(goal.id);
    }
  }, [goal, solved, micro.state, ctx]);

  const diagram = (
    <EntityDiagram
      state={micro.state}
      focus={focus}
      onStep={micro.step}
      onReset={micro.reset}
      onRun={micro.run}
      onPause={micro.pause}
      running={micro.running}
      steps={micro.steps}
      emoji={emoji}
      loupe={loupe}
    />
  );

  const body = (
    <div className={`doc-designer${editable ? ' editable' : ''}`}>
      {editable && (
        <div className="doc-designer-editor">
          <GeneEditorLazy value={source} onChange={setSource} title="your creature" />
        </div>
      )}
      <div className="doc-designer-stage">{diagram}</div>
      {goal && <GoalChip label={goal.label} solved={solved} />}
    </div>
  );

  // A document may pin a language mode (a Bible page about mnemonics wants the
  // advanced names regardless of the reader's global toggle).
  return mode === 'follow' ? body : <LanguageModeFixed mode={mode as 'simple' | 'advanced'}>{body}</LanguageModeFixed>;
}

// <Genome> and <State> are read as DATA by EntityDesignerTag above; they never
// render on their own. Outside a designer, validation rejects them.
export function GenomeTag() {
  return null;
}
export function StateTag() {
  return null;
}
