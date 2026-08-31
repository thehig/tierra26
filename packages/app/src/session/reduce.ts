// The pure main-thread projection of the worker's event stream. Deterministic and
// side-effect-free so it can be unit-tested without a real Worker. Frames flow through
// a ref+rAF coalescer in the hook; everything else (acks/errors/births/deaths) folds here.
import type { WorkerEvent, ObservationFrame, InspectView } from '@tierra26/ui/protocol';

export type RunStatus = 'boot' | 'ready' | 'playing' | 'paused';

export interface SessionState {
  status: RunStatus;
  cycle: number;
  frame: ObservationFrame | null;
  inspect: InspectView | null;
  births: number;
  deaths: number;
  error: string | null;
}

export const initialSessionState: SessionState = {
  status: 'boot', cycle: 0, frame: null, inspect: null, births: 0, deaths: 0, error: null,
};

export function reduceSession(s: SessionState, ev: WorkerEvent): SessionState {
  switch (ev.type) {
    case 'frame': return { ...s, frame: ev.frame, cycle: ev.frame.cycles };
    case 'stats': return { ...s, cycle: ev.stats.cycles };
    case 'inspectResult': return { ...s, inspect: ev.view };
    case 'birth': return { ...s, births: s.births + 1 };
    case 'death': return { ...s, deaths: s.deaths + 1 };
    case 'error': return { ...s, error: ev.message };
    default: return s;
  }
}
