// Live goal ticking: evaluate a lesson's goal against the CURRENT tank frame so it turns
// green as the learner watches. This is presentation only — content's checkGoal remains the
// authoritative, deterministic assessment. Pure + unit-tested.
import type { ObservationFrame } from '@tierra26/ui/protocol.ts';
import type { Goal } from '@tierra26/content/types.ts';

export interface LiveStatus {
  passed: boolean;
  measured: number;
  label: string; // unit word for the readout ("babies", "creatures", …)
}

function minLiveSize(frame: ObservationFrame): number {
  let m = Infinity;
  for (const bin of frame.sizeHist) if (bin.count > 0) m = Math.min(m, bin.key);
  return Number.isFinite(m) ? m : 0;
}

// `founders` = how many seed creatures were injected (each counts as one birth in the engine),
// so daughters = births − founders.
export function liveGoalStatus(goal: Goal, frame: ObservationFrame | null, founders = 1): LiveStatus {
  const s = frame?.stats;
  if (!s) return { passed: false, measured: 0, label: '' };
  const p = goal.params;
  switch (goal.kind) {
    case 'replicates': {
      const daughters = Math.max(0, s.births - founders);
      return { passed: daughters >= (p.count ?? 1), measured: daughters, label: 'babies' };
    }
    case 'reach-pop':
      return { passed: s.population >= (p.population ?? 1), measured: s.population, label: 'creatures' };
    case 'diversity':
      return { passed: s.genotypes >= (p.count ?? 1), measured: s.genotypes, label: 'kinds' };
    case 'survive':
      return { passed: s.population > 0 && frame!.cycles >= (p.cycles ?? 0), measured: frame!.cycles, label: 'cycles' };
    case 'shrink-genome': {
      const min = minLiveSize(frame!);
      return { passed: min > 0 && min < (p.size ?? 0), measured: min, label: 'smallest' };
    }
    default:
      return { passed: false, measured: 0, label: '' };
  }
}
