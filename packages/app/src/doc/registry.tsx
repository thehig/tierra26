// The component registry — one entry per manifest tag.
//
// A DocComponent receives the UNRENDERED node, not pre-rendered children. That
// matters: <Scrolly> has to partition its <Stage> and <Waypoint> children and
// feed them to Scrolly's `stage` render-prop, and <EntityDesigner> has to read
// its <Genome>/<State>/<Goal> children as data rather than as elements.
//
// packages/app/test/registry.test.ts asserts this key set equals the manifest's
// exactly. That test is what stops the language and the app drifting: a tag you
// can author but not render (or render but not author) fails the build.
import type { DocComponent } from './types.ts';

import { ChipTag } from './components/ChipTag.tsx';
import { CalloutTag } from './components/CalloutTag.tsx';
import { FoldTag } from './components/FoldTag.tsx';
import { ScrollyTag, StageTag, WaypointTag } from './components/ScrollyTag.tsx';
import { EntityDesignerTag, GenomeTag, StateTag } from './components/EntityDesignerTag.tsx';
import { ChallengeTag, StarterTag, SolutionTag, GoalTag } from './components/ChallengeTag.tsx';
import { SimulationTag } from './components/SimulationTag.tsx';

export type { DocComponent, DocComponentProps, DocContext } from './types.ts';

export const REGISTRY: Readonly<Record<string, DocComponent>> = Object.freeze({
  Chip: ChipTag,
  Scrolly: ScrollyTag,
  Stage: StageTag,
  Waypoint: WaypointTag,
  EntityDesigner: EntityDesignerTag,
  Genome: GenomeTag,
  State: StateTag,
  Challenge: ChallengeTag,
  Starter: StarterTag,
  Solution: SolutionTag,
  Goal: GoalTag,
  Simulation: SimulationTag,
  Fold: FoldTag,
  Callout: CalloutTag,
});
