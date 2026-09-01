// One emoji per opcode (GeneScript gene name), shown in the genome viewer and the world so the two
// views reinforce each other. The glyphs are OWNED by the editable bindings file (design/bindings.ts,
// keyed by mnemonic); this module just projects them onto gene names, which is how the app looks emoji
// up. Rebind in the Datasheet's Bindings editor and overwrite bindings.ts — the change flows here.
import { allVerbs } from '@tierra26/genescript/vocab.ts';
import { BINDINGS, CONCEPT_BINDINGS } from '../design/bindings.ts';

export const OPCODE_EMOJI: Record<string, string> =
  Object.fromEntries(allVerbs().map((v) => [v.verb, BINDINGS[v.mnemonic]?.emoji ?? '⬛']));

export function opcodeEmoji(gene: string | null): string {
  return gene ? (OPCODE_EMOJI[gene] ?? '⬛') : '';
}

// Top-level block CONCEPT emoji — a label is a signpost you jump to. (Raw blocks are marked by a
// hatched frame + a "byte" tag, not an emoji; a target by a ↳ connector.)
export const CONCEPT_EMOJI = {
  label: CONCEPT_BINDINGS.label!.emoji,
} as const;
