// Gene ⇄ mnemonic source transform. Lives in genescript (not the app) because the
// build-time doc loader needs it too: docs author genomes in REAL MNEMONICS, and
// toGeneSource() turns them back into the gene form the compiler takes.
//
// Originally the editor's advanced view. GeneScript is one statement per
// line; only the FIRST token of a statement is a verb, so a safe swap replaces just that token via the
// VOCAB bijection and leaves everything else exactly as typed: labels (`top:`), control targets (the
// second word), `raw <mnemonic>` lines, comments (`# …`), and all whitespace. Never-fail: an
// unrecognised token is left untouched. The editor keeps the app's source in GENE form (so it always
// compiles) and only renders/edits the mnemonic form as a view.
import { verbToMnemonic, mnemonicToVerb } from './vocab.ts';

function swapLine(line: string, toMnemonic: boolean): string {
  const hash = line.indexOf('#');
  const code = hash >= 0 ? line.slice(0, hash) : line;
  const comment = hash >= 0 ? line.slice(hash) : '';
  const m = /^(\s*)([A-Za-z0-9_-]+)(.*)$/.exec(code);
  if (!m) return line;                       // blank / comment-only / punctuation-only
  const [, ws, tok, tail] = m;
  if (tail!.startsWith(':')) return line;     // a label definition — never a verb
  if (tok!.toLowerCase() === 'raw') return line; // `raw <mnemonic>` already carries the machine name
  const swapped = toMnemonic ? (verbToMnemonic(tok!) ?? tok!) : (mnemonicToVerb(tok!) ?? tok!);
  return ws! + swapped + tail! + comment;
}

/** friendly GeneScript → real mnemonics (grow-a → incA), for the advanced editor view. */
export function toMnemonicSource(src: string): string {
  return src.split('\n').map((l) => swapLine(l, true)).join('\n');
}

/** real mnemonics → friendly GeneScript (incA → grow-a), back to the compilable model form. */
export function toGeneSource(src: string): string {
  return src.split('\n').map((l) => swapLine(l, false)).join('\n');
}
