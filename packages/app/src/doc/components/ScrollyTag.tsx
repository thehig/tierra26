// <Scrolly> / <Stage> / <Waypoint> — the scroll-driven explainer, as a document.
//
// The waypoint -> stage channel is a React context rather than a prop, because
// the stage component is arbitrarily nested inside <Stage> and the manifest is
// meant to grow: a new stage component reads the same context without Scrolly
// knowing it exists.
//
// This is also the one place where the old hard limit is lifted. Previously a
// waypoint could only push a `focus` string; now it publishes a LIST of
// StageEvents, so `at="6"` (step the demo to tick 6) works alongside the
// spotlight, and a future `run-until` is a manifest row rather than a refactor.
import { createContext, useContext } from 'react';
import type { StageEvent } from '@tierra26/content/types.ts';
import { childTag, childTags, waypointEvents } from '@tierra26/content/doclang.ts';
import { Scrolly, type ScrollyStep } from '../../anatomy/Scrolly.tsx';
import { DocNodes, type DocComponentProps } from '../DocRenderer.tsx';

/** The events of the waypoint currently centred in the viewport.
 *  `null` means nothing is being read — the stage shows everything, undimmed. */
const StageEventsContext = createContext<readonly StageEvent[] | null>(null);

export function useStageEvents(): readonly StageEvent[] | null {
  return useContext(StageEventsContext);
}

/** The spotlight target a stage component should show right now. */
export function useStageFocus(): string {
  const events = useStageEvents();
  if (events === null) return 'whole'; // nothing centred -> nothing dimmed
  const f = events.find((e) => e.kind === 'focus');
  return f && f.kind === 'focus' ? f.part : 'whole';
}

/** The tick a stage demo should be parked at, or null to leave it alone. */
export function useStageTick(): number | null {
  const events = useStageEvents();
  if (events === null) return null;
  const a = events.find((e) => e.kind === 'at');
  return a && a.kind === 'at' ? a.step : null;
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
        <StageEventsContext.Provider
          value={active === null ? null : waypointEvents(waypoints[active]!)}
        >
          {stage ? <DocNodes nodes={stage.children} ctx={ctx} /> : null}
        </StageEventsContext.Provider>
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
