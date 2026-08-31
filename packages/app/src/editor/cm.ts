// CodeMirror 6 extensions that render the gene-editor view-model: live keyword coloring
// and subset-aware completions. All facts come from @tierra26/genescript + @tierra26/ui —
// this file stores no opcode, color, or keyword constant (C-UI-SOURCE).
import { EditorView, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { autocompletion, type CompletionSource } from '@codemirror/autocomplete';
import { parse } from '@tierra26/genescript/gs.ts';
import { classic32 } from '@tierra26/engine/isa.ts';
import { viewModel, type EditorState as GeneState } from '@tierra26/ui/editor.ts';

// Build the view-model for a source string under the full classic-32 set.
export function geneState(source: string): GeneState {
  return { mode: 'text', source, ast: parse(source), activeSet: classic32, sessionId: '' };
}

// --- keyword coloring: one Decoration.mark per resolved span, class = cm-kw-<category> ---
function buildDecorations(view: EditorView): DecorationSet {
  const src = view.state.doc.toString();
  const spans = viewModel(geneState(src)).keywordSpans;
  const b = new RangeSetBuilder<Decoration>();
  const len = view.state.doc.length;
  for (const s of spans) {
    if (s.start >= 0 && s.end <= len && s.end > s.start) {
      b.add(s.start, s.end, Decoration.mark({ class: `cm-kw-${s.category}` }));
    }
  }
  return b.finish();
}

export const keywordColoring = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildDecorations(view); }
    update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = buildDecorations(u.view); }
  },
  { decorations: (v) => v.decorations },
);

// --- completions: the unlocked verbs + program labels, from the view-model ---
const verbCompletions: CompletionSource = (ctx) => {
  const word = ctx.matchBefore(/[\w-]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const vm = viewModel(geneState(ctx.state.doc.toString()));
  const items = vm.completions({ line: line.number, col: ctx.pos - line.from + 1, kind: 'verb' });
  if (items.length === 0) return null;
  return {
    from: word.from,
    options: items.map((it) => ({ label: it.insert, type: 'keyword', detail: it.tooltip.kid })),
  };
};

export const geneCompletions = autocompletion({ override: [verbCompletions], activateOnTyping: true });
