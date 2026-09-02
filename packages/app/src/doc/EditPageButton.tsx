// The "Edit this page" affordance, and the only place that decides whether the
// wiki surface exists at all.
//
// DEV ONLY, and dropped from a production build rather than merely hidden in
// one. The save endpoint lives in the content plugin's `configureServer` hook,
// which Vite runs only for the dev server — so in a build there is no route to
// POST to, and a button would be a lie.
//
// `import.meta.env.DEV` is replaced with a literal `false` at build time, so the
// ternary below is a dead branch Rollup removes along with everything only it
// reaches: the editor component AND the ~85 KB of raw markdown behind
// `virtual:tierra-content/sources`. Guarding inside the component instead would
// still have emitted both as chunks — built, deployed, and never loaded.
import { lazy, Suspense, useState, type ComponentType } from 'react';
import type { CorpusDoc } from './docs.ts';

interface EditorProps {
  doc: CorpusDoc;
  dark: boolean;
  onClose: () => void;
}

const LazyEditor: ComponentType<EditorProps> | null = import.meta.env.DEV
  ? lazy(async () => {
      const [{ DocEditor }, { DOC_SOURCES }] = await Promise.all([
        import('./DocEditor.tsx'),
        import('virtual:tierra-content/sources'),
      ]);
      return {
        default: (p: EditorProps) => <DocEditor {...p} source={DOC_SOURCES[p.doc.file] ?? ''} />,
      };
    })
  : null;

export function EditPageButton({ doc, dark }: { doc: CorpusDoc | undefined; dark: boolean }) {
  const [open, setOpen] = useState(false);
  if (!LazyEditor || !doc) return null;
  return (
    <>
      <button className="btn ghost edit-page" onClick={() => setOpen(true)} title={doc.file}>
        ✎ Edit this page
      </button>
      {open && (
        <Suspense fallback={null}>
          <LazyEditor doc={doc} dark={dark} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
