// Code-splits CodeMirror: the editor (and its ~300kB of CM6) loads on demand, so Home and
// the reader don't pay for it up front.
import { lazy, Suspense } from 'react';

const GeneEditor = lazy(() => import('./GeneEditor.tsx').then((m) => ({ default: m.GeneEditor })));

export function GeneEditorLazy(props: {
  value: string;
  onChange: (source: string) => void;
  onInject?: (bytes: Uint8Array) => void;
  title?: string;
}) {
  return (
    <Suspense fallback={
      <div className="editor">
        <div className="editor-head">{props.title ?? 'Gene editor'}</div>
        <div className="editor-loading">loading editor…</div>
      </div>
    }>
      <GeneEditor {...props} />
    </Suspense>
  );
}
