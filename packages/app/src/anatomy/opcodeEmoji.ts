// One DISTINCT emoji per opcode (GeneScript name), grouped by what the block does. Shown both in the
// genome viewer (next to each block) and in the world (small tutorial worlds render it in every cell;
// big worlds reveal it under the hover magnifier), so the two views reinforce each other. All 32 are
// unique — tweak freely, this map is the whole source of truth.
export const OPCODE_EMOJI: Record<string, string> = {
  // landmarks / templates (nop0 / nop1)
  'mark-0': '🔵', 'mark-1': '🔴',
  // bit & number tricks (notebook C)
  'flip-bit': '🪙', 'double': '✖️', 'clear': '🧹', 'if-zero': '❓',
  'subtract': '➖', 'subtract-into-a': '🔻',
  // grow / shrink a notebook
  'grow-a': '🌱', 'grow-b': '🌿', 'grow-c': '🌳', 'shrink-c': '🍂',
  // save-pile: push
  'save-a': '📥', 'save-b': '💾', 'save-c': '🧺', 'save-d': '🗄️',
  // save-pile: pop
  'load-a': '📤', 'load-b': '📂', 'load-c': '🧲', 'load-d': '🎣',
  // move the reading head
  'jump': '⏩', 'jump-back': '⏪', 'call': '📞', 'return': '🔙',
  // copying between notebooks / bytes
  'copy-c-to-d': '🔃', 'copy-a-to-b': '🔄', 'copy-byte': '✂️',
  // searching for landmarks
  'find': '🔍', 'find-back': '🔎', 'find-forward': '🔦',
  // reproduction
  'make-space': '🏗️', 'divide': '👶',
};

export function opcodeEmoji(gene: string | null): string {
  return gene ? (OPCODE_EMOJI[gene] ?? '⬛') : '';
}

// Top-level block CONCEPTS — not opcodes, but block KINDS the genome viewer marks distinctly. A label
// is a signpost you jump to; a raw block is an exact opcode byte the source pinned (nuts-and-bolts).
export const CONCEPT_EMOJI = {
  label: '🪧',
  raw: '🔩',
} as const;
