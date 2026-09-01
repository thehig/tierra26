// <Scrolly> / <Stage> / <Waypoint> — the scroll-driven explainer, as a document.
//
// The waypoint -> stage channel is a React context rather than a prop, because
// the stage component is arbitrarily nested inside <Stage> and the manifest is
// meant to grow: a new stage component reads the same context without Scrolly
// knowing it exists.
//
// This is where the old hard limit is lifted. A waypoint used to be able to push
// only a `focus` string at the stage. Now it can also ADVANCE the demo
// (`at="6"`, or `run-until="birth"` when the interesting tick is not a number an
// author should have to know) and MODIFY it — its own <Genome> or <State>
// replaces the stage's for as long as that waypoint is the one being read.
import { createContext, useContext } from 'react';
import type { DocTagNode, StageCondition } from '@tierra26/content/types.ts';
import { childTag, childTags, waypointEvents } from '@tierra26/content/doclang.ts';
import { Scrolly, type ScrollyStep } from '../../anatomy/Scrolly.tsx';
import { DocNodes, type DocComponentProps } from '../DocRenderer.tsx';

/** The waypoint currently centred in the viewport, or null when nothing is being
 *  read — in which case the stage shows everything, undimmed.
 *
 *  The whole NODE is published, not a pre-digested event list, so a new waypoint
 *  capability is a new reader rather than a new case in a union that Scrolly
 *  would also have to know about. `<Genome>` and `<State>` overrides ride along
 *  for free that way.  */
const ActiveWaypointContext = createContext<DocTagNode | null>(null);

export function useActiveWaypoint(): DocTagNode | null {
  return useContext(ActiveWaypointContext);
}

/** The spotlight target a stage component should show right now. */
export function useStageFocus(): string {
  const wp = useActiveWaypoint();
  if (!wp) return 'whole'; // nothing centred -> nothing dimmed
  const f = waypointEvents(wp).find((e) => e.kind === 'focus');
  return f && f.kind === 'focus' ? f.part : 'whole';
}

/** How the centred waypoint wants the demo advanced, if at all. */
export interface StageAdvance {
  at?: number;
  until?: StageCondition;
}

export function useStageAdvance(): StageAdvance | null {
  const wp = useActiveWaypoint();
  if (!wp) return null;
  const out: StageAdvance = {};
  for (const e of waypointEvents(wp)) {
    if (e.kind === 'at') out.at = e.step;
    if (e.kind === 'until') out.until = e.condition;
  }
  return out.at === undefined && out.until === undefined ? null : out;
}

/** A waypoint may replace what the stage is showing while it is being read. */
export function useStageOverrides(): { genome?: DocTagNode; state?: DocTagNode } {
  const wp = useActiveWaypoint();
  if (!wp) return {};
  const genome = childTag(wp, 'Genome');
  const state = childTag(wp, 'State');
  return { ...(genome ? { genome } : {}), ...(state ? { state } : {}) };
}

export function ScrollyTag({ node, ctx }: DocComponentProps) {
  const stage = childTag(node, 'Stage');
  const waypoints = childTags(node, 'Waypoint');

  const steps: ScrollyStep[] = waypoints.map((w, i) => ({
    id: `wp${i}`,
    content: <DocNodes nodes={w.children} ctx={ctx} />,
  }));

  return (
    <Scrolly
      steps={steps}
      stage={(active) => (
        <ActiveWaypointContext.Provider value={active === null ? null : waypoints[active]!}>
          {stage ? <DocNodes nodes={stage.children} ctx={ctx} /> : null}
        </ActiveWaypointContext.Provider>
      )}
    />
  );
}

// <Stage> and <Waypoint> are consumed by ScrollyTag above, so these only run if
// one appears outside a Scrolly — which validation rejects at build time. They
// render their contents rather than nothing, so a live authoring sandbox shows
// something sensible while a document is half-typed.
export function StageTag({ node, ctx }: DocComponentProps) {
  return <DocNodes nodes={node.children} ctx={ctx} />;
}

export function WaypointTag({ node, ctx }: DocComponentProps) {
  return <DocNodes nodes={node.children} ctx={ctx} />;
}
