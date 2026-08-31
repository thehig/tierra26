// Renders a lesson: parse its source (content), project to the reader model, and lay out
// the ordered blocks — prose, lazy playgrounds, goals.
import { useMemo } from 'react';
import { parse } from '@tierra26/content/content.ts';
import { toRenderModel } from '@tierra26/ui/reader.ts';
import { Prose } from './Prose.tsx';
import { LazyPlayground } from './LazyPlayground.tsx';

export function LessonReader({ source, dark }: { source: string; dark: boolean }) {
  const model = useMemo(() => toRenderModel(parse(source).ast), [source]);
  return (
    <article className="reader">
      {model.blocks.map((b, i) => {
        if (b.kind === 'prose') return <Prose key={i} spans={b.spans} />;
        if (b.kind === 'playground') return <LazyPlayground key={i} config={b.config} dark={dark} prompt={b.goal?.title} />;
        if (b.kind === 'goal') return <div key={i} className="goalcard"><span className="goaltag">Goal</span> {b.goal.title}</div>;
        return <div key={i} className="diag error">{b.message}</div>;
      })}
    </article>
  );
}
