// DocRenderer — walk a parsed document and paint it.
//
// The whole app-side of the pipeline is this dispatch plus the registry: prose
// goes to MiniMark, a tag goes to its registered component, and anything the
// parser could not understand renders as a VISIBLE diagnostic card rather than
// vanishing. A document that fails to render should say so on the page — a
// blank space is the one outcome an author cannot debug.
import type { DocNode, DocTagNode } from '@tierra26/content/types.ts';
import { MiniMark } from './MiniMark.tsx';
import { REGISTRY } from './registry.tsx';
import type { DocContext } from './types.ts';

export type { DocComponentProps, DocContext } from './types.ts';

export function DocNodes({
  nodes,
  ctx,
  skipLeadingHeading = false,
}: {
  nodes: readonly DocNode[];
  ctx: DocContext;
  skipLeadingHeading?: boolean;
}) {
  const firstProse = nodes.findIndex((n) => n.kind === 'prose');
  return (
    <>
      {nodes.map((node, i) => (
        <DocNodeView
          key={i}
          node={node}
          ctx={ctx}
          skipLeadingHeading={skipLeadingHeading && i === firstProse}
        />
      ))}
    </>
  );
}

function DocNodeView({
  node,
  ctx,
  skipLeadingHeading = false,
}: {
  node: DocNode;
  ctx: DocContext;
  skipLeadingHeading?: boolean;
}) {
  if (node.kind === 'prose') {
    return <MiniMark markdown={node.markdown} skipLeadingHeading={skipLeadingHeading} />;
  }

  if (node.kind === 'error') {
    return (
      <div className="doc-diag" role="alert">
        <span className="doc-diag-tag">doc</span>
        <span className="doc-diag-msg">{node.diagnostic.message}</span>
        <code className="doc-diag-src">{node.raw}</code>
      </div>
    );
  }

  const Component = REGISTRY[node.name];
  if (!Component) {
    // Unreachable through the build-time pipeline (validation rejects an unknown
    // tag first) — but a live authoring sandbox parses mid-keystroke, so this
    // path has to be a readable message rather than a crash.
    return (
      <div className="doc-diag" role="alert">
        <span className="doc-diag-tag">doc</span>
        <span className="doc-diag-msg">
          &lt;{node.name}&gt; has no renderer in this build.
        </span>
      </div>
    );
  }
  return <Component node={node} ctx={ctx} />;
}

/** Render a whole document body. */
export function DocRenderer({
  body,
  dark,
  onGoalMet,
  skipLeadingHeading = false,
}: {
  body: readonly DocNode[];
  dark: boolean;
  onGoalMet?: (goalId: string) => void;
  skipLeadingHeading?: boolean;
}) {
  const ctx: DocContext = onGoalMet ? { dark, onGoalMet } : { dark };
  return (
    <div className="doc">
      <DocNodes nodes={body} ctx={ctx} skipLeadingHeading={skipLeadingHeading} />
    </div>
  );
}

/** Helpers components share for reading their own node. */
export const attr = {
  str(node: DocTagNode, key: string, fallback?: string): string | undefined {
    const v = node.attrs[key];
    return typeof v === 'string' ? v : fallback;
  },
  int(node: DocTagNode, key: string, fallback: number): number {
    const v = node.attrs[key];
    return typeof v === 'number' ? v : fallback;
  },
  bool(node: DocTagNode, key: string, fallback = false): boolean {
    const v = node.attrs[key];
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return fallback;
  },
  list(node: DocTagNode, key: string): string[] {
    const v = node.attrs[key];
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string' && v.trim() !== '') return v.split(',').map((s) => s.trim());
    return [];
  },
};
