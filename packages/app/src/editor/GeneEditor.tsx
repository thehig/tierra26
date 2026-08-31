// The gene editor: a CodeMirror surface with live coloring + completions, plus the
// diagnostics strip and the compile-gated Inject button. The view-model is the single
// source for coloring, diagnostics, and the compiled bytes.
import { useEffect, useMemo, useRef } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { completionKeymap } from '@codemirror/autocomplete';
import { viewModel } from '@tierra26/ui/editor.ts';
import { keywordColoring, geneCompletions, geneState } from './cm.ts';

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

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
          keywordColoring,
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
    </div>
  );
}
