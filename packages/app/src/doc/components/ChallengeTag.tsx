// <Challenge> — the "your turn" exercise, as a document.
//
//   <Challenge>
//   Make <Chip register="A"/> reach 3.
//   <Starter>
//   incA
//   </Starter>
//   <Goal kind="regAtLeast" reg="A" value="3" label="A reaches 3" />
//   <Solution budget="20">
//   incA
//   incA
//   incA
//   </Solution>
//   </Challenge>
//
// This is a thin adapter over the existing MicroSandbox, not a second
// implementation of it — the editor/diagram/latched-goal behaviour and its
// styling already existed and are already tested.
//
// <Solution> renders nothing. It exists so the reference answer lives beside the
// challenge it answers, and so packages/app/test/chapters.test.ts can prove every
// challenge is solvable and that no starter already solves itself.
import { useMemo } from 'react';
import type { DocNode } from '@tierra26/content/types.ts';
import { MicroSandbox } from '../../learn/MicroSandbox.tsx';
import { attr, childTag, geneTextOf, goalOf } from '../readers.ts';
import { DocNodes, type DocComponentProps } from '../DocRenderer.tsx';

/** A goal chip for a component that is not a full challenge (an <EntityDesigner>
 *  with a <Goal> child). A real challenge uses MicroSandbox's own goal row. */
export function GoalChip({ label, solved }: { label: string; solved: boolean }) {
  return (
    <div className={`doc-goal${solved ? ' solved' : ''}`}>
      <span className="doc-goal-tag">{solved ? '✓' : 'goal'}</span>
      <span className="doc-goal-label">{label}</span>
    </div>
  );
}

export function ChallengeTag({ node, ctx }: DocComponentProps) {
  const goal = useMemo(() => goalOf(node), [node]);
  const starter = useMemo(() => geneTextOf(childTag(node, 'Starter')), [node]);
  const soup = attr.int(node, 'soup', 36);

  if (!goal) {
    return (
      <div className="doc-diag" role="alert">
        <span className="doc-diag-tag">doc</span>
        <span className="doc-diag-msg">
          This challenge has no single-creature goal the stage can check.
        </span>
      </div>
    );
  }

  // The prompt is the challenge's own prose; the child tags are data, not content.
  const promptNodes = node.children.filter((c: DocNode) => c.kind !== 'tag');

  return (
    <MicroSandbox
      challenge={{ prompt: '', starter, goal: goal.micro }}
      soup={soup}
      prompt={<DocNodes nodes={promptNodes} ctx={ctx} />}
      onSolved={() => ctx.onGoalMet?.(goal.id)}
    />
  );
}

// Read as data by the components above; never rendered on their own.
export function StarterTag() {
  return null;
}
export function SolutionTag() {
  return null;
}
export function GoalTag() {
  return null;
}
