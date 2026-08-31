// Renders a lesson by walking its parsed AST: prose (with resolved keyword spans), lazy
// playgrounds (carrying the block's full goal for live ticking), and goal cards. Walking the
// AST (rather than the render model) keeps the goals' params for live evaluation.
import { useMemo } from 'react';
import { parse } from '@tierra26/content/content.ts';
import { resolveProseSpans } from '@tierra26/ui/reader.ts';
import { Prose } from './Prose.tsx';
import { LazyPlayground } from './LazyPlayground.tsx';

export function LessonReader({ source, dark, onGoalMet }: { source: string; dark: boolean; onGoalMet: (goalId: string) => void }) {
  const ast = useMemo(() => parse(source).ast, [source]);
  return (
    <article className="reader">
      {ast.body.map((node, i) => {
        if (node.kind === 'prose') return <Prose key={i} spans={resolveProseSpans(node)} />;
        if (node.kind === 'playground') {
          return (
            <LazyPlayground
              key={i}
              config={node.config}
              goal={node.goal}
              dark={dark}
              onGoalMet={node.goal ? () => onGoalMet(node.goal!.id) : undefined}
            />
          );
        }
        if (node.kind === 'goal') return <div key={i} className="goalcard"><span className="goaltag">Goal</span> {node.goal.title}</div>;
        return <div key={i} className="diag error">{node.diagnostic.message}</div>;
      })}
    </article>
  );
}
