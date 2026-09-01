// Shared shapes for the doc renderer. Their own module so the components, the
// registry and DocRenderer can all reach them without an import cycle
// (registry -> components -> registry).
import type { ReactNode } from 'react';
import type { DocTagNode } from '@tierra26/content/types.ts';

/** Everything a component may need that is not in its own node. */
export interface DocContext {
  dark: boolean;
  /** Fired when a <Goal> in this document is met. */
  onGoalMet?: (goalId: string) => void;
}

export interface DocComponentProps {
  node: DocTagNode;
  ctx: DocContext;
}

/** A component receives the UNRENDERED node: <Scrolly> has to partition its own
 *  children, and <EntityDesigner> reads <Genome>/<State> as data, not elements. */
export type DocComponent = (props: DocComponentProps) => ReactNode;
