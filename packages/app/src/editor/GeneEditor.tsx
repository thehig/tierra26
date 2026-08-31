// The gene editor: a CodeMirror surface with live coloring + completions + keyword hover cards,
// plus the diagnostics strip, the compile-gated Inject button, and an optional "peek under the
// hood" pane. The view-model is the single source for coloring, diagnostics, and compiled bytes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { completionKeymap } from '@codemirror/autocomplete';
import { viewModel } from '@tierra26/ui/editor.ts';
import { keywordColoring, geneCompletions, geneState, keywordHover } from './cm.ts';
import { buildPeekModel } from './peek.ts';

export function GeneEditor({
  value, onChange, onInject, title = 'Gene editor',
}: {
  value: string;
  onChange: (source: string) => void;
  onInject?: (bytes: Uint8Array) => void; // omit → a plain colored editor (no inject-into-soup)
  title?: string;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
          keywordColoring,
          keywordHover,
          geneCompletions,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => { if (u.docChanged) onChangeRef.current(u.state.doc.toString()); }),
        ],
      }),
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controlled: an external change (e.g. "open in editor") replaces the doc.
  useEffect(() => {
    const v = viewRef.current;
    if (v && value !== v.state.doc.toString()) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  const vm = useMemo(() => viewModel(geneState(value)), [value]);
  const errors = vm.diagnostics.filter((d) => d.severity === 'error');
  const peekModel = useMemo(() => (peek ? buildPeekModel(value) : null), [peek, value]);

  return (
    <div className="editor">
      <div className="editor-head">{title}</div>
      <div className="editor-cm" ref={host} />
      <div className="editor-bar">
        {onInject && (
          <button className="btn primary" disabled={!vm.compiled.injectable} onClick={() => onInject(vm.compiled.bytes)}>
            Inject ▸
          </button>
        )}
        <button
          className={`btn ghost peek-toggle ${peek ? 'on' : ''}`}
          aria-pressed={peek}
          onClick={() => setPeek((p) => !p)}
        >
          👁 peek
        </button>
        <span className="editor-status">
          {vm.compiled.injectable
            ? `${vm.compiled.bytes.length} bytes ready`
            : `${errors.length} problem${errors.length === 1 ? '' : 's'} to fix`}
        </span>
      </div>
      {vm.diagnostics.length > 0 && (
        <ul className="diags">
          {vm.diagnostics.map((d, i) => (
            <li key={i} className={`diag ${d.severity}`}>{d.message}</li>
          ))}
        </ul>
      )}
      {peekModel && <PeekPane model={peekModel} />}
    </div>
  );
}

// The peek pane: each source line that emitted bytes, with the byte range and the opcodes it
// compiled to. Hover a row to light up its line ↔ its bytes together. Pure presentation over
// the source map — no opcode/label facts of its own.
function PeekPane({ model }: { model: ReturnType<typeof buildPeekModel> }) {
  if (!model.ok) {
    return <div className="peek empty">Fix the problems above, then peek at the compiled genome.</div>;
  }
  if (model.rows.length === 0) {
    return <div className="peek empty">Nothing compiled yet — write a line to see its bytes.</div>;
  }
  return (
    <div className="peek">
      <div className="peek-head">
        <span>source line</span>
        <span className="peek-total">{model.totalBytes} bytes</span>
      </div>
      <ul className="peek-rows">
        {model.rows.map((r) => (
          <li key={r.stmt} className="peek-row">
            <span className="peek-line" title={`line ${r.line}`}>{r.line}</span>
            <code className="peek-src">{r.text || '·'}</code>
            <span className="peek-range">{r.start}–{r.end}</span>
            <span className="peek-bytes">
              {r.bytes.map((b) => (
                <span key={b.offset} className="peek-byte" title={`byte ${b.offset} · opcode ${b.opcode}`}>
                  {b.label}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
