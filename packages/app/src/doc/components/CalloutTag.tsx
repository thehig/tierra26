import { DocNodes } from '../DocRenderer.tsx';
import { attr, type DocComponentProps } from '../DocRenderer.tsx';

const ICON: Record<string, string> = { note: 'ℹ️', tip: '💡', warning: '⚠️' };

export function CalloutTag({ node, ctx }: DocComponentProps) {
  const kind = attr.str(node, 'kind', 'note')!;
  return (
    <aside className={`doc-callout doc-callout-${kind}`}>
      <span className="doc-callout-icon" aria-hidden="true">{ICON[kind] ?? ICON['note']}</span>
      <div className="doc-callout-body">
        <DocNodes nodes={node.children} ctx={ctx} />
      </div>
    </aside>
  );
}
