// CodeMirror 6 extensions that render the gene-editor view-model: live keyword coloring
// and subset-aware completions. All facts come from @tierra26/genescript + @tierra26/ui —
// this file stores no opcode, color, or keyword constant (C-UI-SOURCE).
import { EditorView, Decoration, ViewPlugin, hoverTooltip, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, type EditorState as CMState } from '@codemirror/state';
import { autocompletion, type CompletionSource } from '@codemirror/autocomplete';
import { parse } from '@tierra26/genescript/gs.ts';
import { classic32 } from '@tierra26/engine/isa.ts';
import { viewModel, keywordTooltip, type EditorState as GeneState } from '@tierra26/ui/editor.ts';
import { entry, entryOfMnemonic, mnemonicToVerb, takesTarget } from '@tierra26/genescript/vocab.ts';

// Build the view-model for a source string under the full classic-32 set.
export function geneState(source: string): GeneState {
  return { mode: 'text', source, ast: parse(source), activeSet: classic32, sessionId: '' };
}

// Resolve a token to its VOCAB entry whether it is written as a gene (grow-a) or a mnemonic (incA),
// so coloring & hover work in BOTH language modes without knowing which mode the buffer is in.
function resolveToken(tok: string) { return entry(tok) ?? entryOfMnemonic(tok); }

// --- keyword coloring: colour each statement's verb by category, mode-agnostic (gene OR mnemonic) ---
// Token-based rather than parse-based, so an advanced (mnemonic) buffer colours identically to a
// friendly one. Labels (`top:`), `raw` lines, and control targets (a user's label) are left uncoloured.
function buildDecorations(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const hash = line.text.indexOf('#');
    const code = hash >= 0 ? line.text.slice(0, hash) : line.text;
    const m = /^(\s*)([A-Za-z0-9_-]+)(.*)$/.exec(code);
    if (!m) continue;
    const [, ws, tok, tail] = m;
    if (tail!.startsWith(':') || tok!.toLowerCase() === 'raw') continue; // label def / raw byte
    const v = resolveToken(tok!);
    if (!v) continue;
    const from = line.from + ws!.length;
    b.add(from, from + tok!.length, Decoration.mark({ class: `cm-kw-${v.category}` }));
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

// --- completions: subset verbs at the start of a line; program LABELS after a control verb
// that takes a target (jump/jump-back/call/find/…), both from the view-model. ---
const verbCompletions: CompletionSource = (ctx) => {
  const word = ctx.matchBefore(/[\w-]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);
  const firstWord = before.trim().split(/\s+/)[0] ?? '';
  // In the target slot iff the line's first token is a target-taking verb and we're past it.
  const inTargetSlot = firstWord.length > 0 && takesTarget(firstWord) && /\s/.test(before.trimStart().slice(firstWord.length));
  const vm = viewModel(geneState(ctx.state.doc.toString()));
  const items = vm.completions({ line: line.number, col: ctx.pos - line.from + 1, kind: inTargetSlot ? 'target' : 'verb' });
  if (items.length === 0) return null;
  return {
    from: word.from,
    options: items.map((it) => ({
      label: it.insert,
      type: it.source === 'program-label' ? 'variable' : 'keyword',
      detail: it.tooltip.kid,
    })),
  };
};

export const geneCompletions = autocompletion({ override: [verbCompletions], activateOnTyping: true });

// --- keyword hover: the SAME kid+machine card as the reader, from the registry (C-UI-SOURCE) ---
// The word under the pointer is resolved through the view-model's keywordTooltip; non-keywords
// return null (no card), so only colored keywords surface a tooltip.
function wordAt(state: CMState, pos: number): { from: number; to: number; text: string } {
  const line = state.doc.lineAt(pos);
  const s = line.text;
  const rel = pos - line.from;
  const isWord = (c: string | undefined) => c !== undefined && /[\w-]/.test(c);
  let a = rel;
  let b = rel;
  while (a > 0 && isWord(s[a - 1])) a -= 1;
  while (b < s.length && isWord(s[b])) b += 1;
  return { from: line.from + a, to: line.from + b, text: s.slice(a, b) };
}

export const keywordHover = hoverTooltip((view, pos) => {
  const { from, to, text } = wordAt(view.state, pos);
  if (from === to) return null;
  // resolve a mnemonic back to its verb so the advanced buffer hovers the same card as the friendly one
  const tip = keywordTooltip(mnemonicToVerb(text) ?? text);
  if (!tip) return null;
  return {
    pos: from,
    end: to,
    above: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-kwtip';
      const kid = dom.appendChild(document.createElement('div'));
      kid.className = 'cm-kwtip-kid';
      kid.textContent = tip.kid;
      if (tip.machine) {
        const more = dom.appendChild(document.createElement('div'));
        more.className = 'cm-kwtip-more';
        more.textContent = tip.machine;
      }
      return { dom };
    },
  };
});
