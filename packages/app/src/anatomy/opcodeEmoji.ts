// One emoji per opcode (GeneScript name), shown in the world magnifier so you can read a creature's
// body in place. Grouped by what the block does; register variants share a family but the magnifier
// caption always names the exact block. Tweak freely — this map is the whole source of truth.
export const OPCODE_EMOJI: Record<string, string> = {
  // landmarks / templates
  'mark-0': '🔵', 'mark-1': '🔴',
  // bit & number tricks (work on notebook C)
  'flip-bit': '🎲', 'double': '✖️', 'clear': '🧹', 'if-zero': '❓',
  'subtract': '➖', 'subtract-into-a': '🔻',
  // grow / shrink a notebook
  'grow-a': '🌱', 'grow-b': '🌿', 'grow-c': '🌳', 'shrink-c': '🍂',
  // save-pile (push / pop)
  'save-a': '📥', 'save-b': '📦', 'save-c': '🧰', 'save-d': '🗄️',
  'load-a': '📤', 'load-b': '📬', 'load-c': '📭', 'load-d': '📮',
  // move the reading head
  'jump': '↪️', 'jump-back': '↩️', 'call': '📞', 'return': '🔙',
  // copying
  'copy-c-to-d': '🔃', 'copy-a-to-b': '🔄', 'copy-byte': '✂️',
  // searching for landmarks
  'find': '🔍', 'find-back': '🔎', 'find-forward': '🔦',
  // reproduction
  'make-space': '🏗️', 'divide': '👶',
};

export function opcodeEmoji(gene: string | null): string {
  return gene ? (OPCODE_EMOJI[gene] ?? '⬛') : '';
}
