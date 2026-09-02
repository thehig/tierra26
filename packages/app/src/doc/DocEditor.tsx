// "Edit this page" — the wiki surface over docs/.
//
// The document IS the page, so editing it is the honest way to change what a
// reader sees. This edits the REAL markdown: Save POSTs to the dev server, which
// writes docs/<...>.md, and the file is the store — an edit is still there after
// the server restarts, and `git diff` shows it like any other change.
//
// DEV ONLY, by construction rather than by a flag someone can forget: the save
// endpoint lives in the content plugin's `configureServer` hook, which does not
// run in `vite build`. A production bundle has no such route, so the button is
// hidden there (see EditPageButton).
//
// Validation runs in the browser against the WHOLE corpus, not just the draft.
// That matters: renaming a concept's slug turns {that-token} into an unknown
// token in every other document, and only a corpus-wide check can see it. The
// server repeats the check before it commits the bytes — the browser copy is for
// feedback, the server copy is the gate.
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseDoc, validateDoc, type DocResolver } from '@tierra26/content/doclang.ts';
import type { DocKind, Diagnostic } from '@tierra26/content/types.ts';
import { isVerb, mnemonicToVerb } from '@tierra26/genescript/vocab.ts';
import { STARTERS } from '@tierra26/content/lessons.ts';
import { conceptDocs, lessonDocs, opcodeDocs, type CorpusDoc } from './docs.ts';
import { DocRenderer } from './DocRenderer.tsx';

/** The resolver the validator needs, built from the corpus already in memory. */
function corpusResolver(): DocResolver {
  const concepts = new Set(conceptDocs.map((d) => d.slug));
  const lessons = new Set(lessonDocs.map((d) => d.slug));
  return {
    isOpcode: (t) => isVerb(t) || mnemonicToVerb(t) !== undefined,
    hasConcept: (s) => concepts.has(s),
    hasLesson: (s) => lessons.has(s),
    hasGenome: (s) => s in STARTERS,
    // Scenario/subset/snapshot ids are resolved by the build, which is also what
    // gates the save. Accepting them here keeps the editor from red-flagging
    // something the server will happily take.
    hasScenario: () => true,
    hasSubset: () => true,
    hasSnapshot: () => false,
  };
}

export interface DocEditorProps {
  doc: CorpusDoc;
  source: string;
  dark: boolean;
  onClose: () => void;
}

export function DocEditor({ doc, source, dark, onClose }: DocEditorProps) {
  const [draft, setDraft] = useState(source);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const resolver = useMemo(corpusResolver, []);
  const ta = useRef<HTMLTextAreaElement | null>(null);

  // Re-parsed every keystroke. `parseDoc` never throws and turns a malformed
  // block into an ErrorNode, so the preview keeps painting mid-typing.
  const { ast, problems } = useMemo(() => {
    const meta = { kind: doc.kind as DocKind, slug: doc.slug, file: doc.file };
    const r = parseDoc(draft, meta);
    const all: Diagnostic[] = [...r.diagnostics, ...validateDoc(r.ast, resolver)];
    return { ast: r.ast, problems: all };
  }, [draft, doc.kind, doc.slug, doc.file, resolver]);

  const errors = problems.filter((d) => d.severity === 'error');
  const dirty = draft !== source;
  const canSave = dirty && errors.length === 0 && !saving;

  // Escape closes, ctrl/cmd-S saves — the two things a wiki editor must have.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (canSave) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function save() {
    setSaving(true);
    setServerError(null);
    try {
      const res = await fetch('/__docs/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file: doc.file, source: draft }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setServerError(body.error ?? `save failed (${res.status})`);
        return;
      }
      // No local state to update: the write trips the dev watcher, the plugin
      // invalidates the content modules, and the page behind this editor
      // re-renders itself from the new file.
      onClose();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="de-backdrop" role="dialog" aria-modal="true" aria-label={`Edit ${doc.file}`}>
      <div className="de">
        <header className="de-bar">
          <span className="de-file">{doc.file}</span>
          <span className="de-spacer" />
          {dirty && <span className="de-dirty">unsaved</span>}
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={!canSave} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </header>

        <div className="de-body">
          <textarea
            ref={ta}
            className="de-src"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Markdown source"
          />
          <div className="de-preview">
            <DocRenderer body={ast.body} dark={dark} skipLeadingHeading />
          </div>
        </div>

        {(problems.length > 0 || serverError) && (
          <div className="de-diags">
            {serverError && <pre className="de-diag de-err">{serverError}</pre>}
            {problems.map((d, i) => (
              <div key={i} className={`de-diag ${d.severity === 'error' ? 'de-err' : 'de-warn'}`}>
                <b>{d.loc.line}</b> {d.code} — {d.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
