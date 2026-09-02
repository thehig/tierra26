// The "Edit this page" affordance, and the only place that decides whether the
// wiki surface exists at all.
//
// It appears whenever the SERVER says it can write — `editable` on the corpus
// the app booted from. That is true for the dev server and for the production
// server, and false for a plain static deployment where there is nothing to
// POST to. Gating on the server's answer rather than on the build mode is what
// makes editing work in production without pretending it works on a file host.
//
// The editor itself and the document source are both fetched on demand, so a
// reader who never clicks pays nothing.
import { lazy, Suspense, useState } from 'react';
import { getCorpus, type CorpusDoc } from './corpus.ts';

interface EditorProps {
  doc: CorpusDoc;
  dark: boolean;
  onClose: () => void;
}

const LazyEditor = lazy(async () => ({ default: (await import('./DocEditor.tsx')).DocEditor }));

export function EditPageButton({ doc, dark }: { doc: CorpusDoc | undefined; dark: boolean }) {
  const [open, setOpen] = useState(false);
  if (!doc || !getCorpus().editable) return null;
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
