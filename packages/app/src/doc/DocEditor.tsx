// "Edit this page" — the wiki surface over docs/.
//
// The document IS the page, so editing it is the honest way to change what a
// reader sees. This edits the REAL markdown: Save POSTs to the dev server, which
// writes docs/<...>.md, and the file is the store — an edit is still there after
// the server restarts, and `git diff` shows it like any other change.
//
// It works in production, not just in dev. The same docs API is mounted by the
// Vite dev server and by the production server (server/docsApi.ts), so this
// component knows nothing about which one it is talking to.
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
import { conceptDocs, lessonDocs } from './docs.ts';
import { loadCorpus, setCorpus, type CorpusDoc } from './corpus.ts';
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

/** The docs API, relative to the deployed base (see corpus.ts). */
const API = `${import.meta.env.BASE_URL || '/'}api/`.replace('//api/', '/api/');

export interface DocEditorProps {
  doc: CorpusDoc;
  dark: boolean;
  onClose: () => void;
}

export function DocEditor({ doc, dark, onClose }: DocEditorProps) {
  // The source is fetched, not bundled: shipping 85 KB of markdown to every
  // reader so that one of them might edit it is the wrong trade, and in
  // production the file on the server is the only copy that is actually current.
  const [source, setSource] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const resolver = useMemo(corpusResolver, []);
  const ta = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch(`${API}doc?file=${encodeURIComponent(doc.file)}`);
        const body = (await res.json()) as { ok: boolean; source?: string; error?: string };
        if (!live) return;
        if (!res.ok || !body.ok) return setServerError(body.error ?? `could not open (${res.status})`);
        setSource(body.source ?? '');
        setDraft(body.source ?? '');
      } catch (e) {
        if (live) setServerError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
  }, [doc.file]);

  // Re-parsed every keystroke. `parseDoc` never throws and turns a malformed
  // block into an ErrorNode, so the preview keeps painting mid-typing.
  const { ast, problems } = useMemo(() => {
    const meta = { kind: doc.kind as DocKind, slug: doc.slug, file: doc.file };
    const r = parseDoc(draft, meta);
    const all: Diagnostic[] = [...r.diagnostics, ...validateDoc(r.ast, resolver)];
    return { ast: r.ast, problems: all };
  }, [draft, doc.kind, doc.slug, doc.file, resolver]);

  const errors = problems.filter((d) => d.severity === 'error');
  const dirty = source !== null && draft !== source;
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
      const res = await fetch(`${API}doc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file: doc.file, source: draft }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setServerError(body.error ?? `save failed (${res.status})`);
        return;
      }
      // Re-read the corpus from the server and hard-reload, so what the page
      // shows is what the server now holds. A dev-server HMR update would cover
      // this in dev only; going through the API keeps dev and production
      // identical, which is the whole point of this change.
      setCorpus(await loadCorpus());
      location.reload();
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
            disabled={source === null}
            value={source === null ? 'loading…' : draft}
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
