// THE DATASHEET — the single definition of tierra26's visual language: the opcode categories and what
// their colours MEAN, the per-register colours, the block-kind treatments (label / raw / payload), and
// the full opcode roster. Every surface that renders an opcode (genome viewer, instruction text, the
// editor, tooltips) should read its colour / emoji / text from here, so an opcode looks the SAME
// everywhere — the "Nintendo" rule. This module OWNS the meanings and register colours; it single-
// sources the rest from VOCAB (category + text) and opcodeEmoji (glyph) rather than re-authoring them.
import { allVerbs, type VerbEntry } from '@tierra26/genescript/vocab.ts';
import { opcodeEmoji, CONCEPT_EMOJI } from '../anatomy/opcodeEmoji.ts';
import { categoryVar } from './palette.ts';

// The four categories an OPCODE can belong to (a subset of KeywordCategory — 'value'/'concept' are for
// nouns in prose, never opcodes). Order = how the datasheet and the wiki index present them.
export type OpcodeCategory = 'control' | 'register' | 'action' | 'marker';

export interface CategoryDef { key: OpcodeCategory; label: string; colorVar: string; meaning: string; }
export const CATEGORIES: readonly CategoryDef[] = [
  { key: 'control', label: 'control', colorVar: categoryVar('control'), meaning: 'Flow & family — jump to landmarks, find them, call routines, and make & split a baby.' },
  { key: 'register', label: 'register', colorVar: categoryVar('register'), meaning: 'The four notebooks — maths on A/B/C/D and the save-pile.' },
  { key: 'action', label: 'action', colorVar: categoryVar('action'), meaning: 'Change a bit or a byte — flip, double, clear, and copy.' },
  { key: 'marker', label: 'marker', colorVar: categoryVar('marker'), meaning: 'Landmark bits (nop0/nop1) — the signposts labels and templates are built from.' },
];

// Block KINDS are rendering treatments, not opcode categories: any opcode can appear raw; a run of
// marker bits can be a named label; a control op's template is a payload.
export interface BlockKindDef { key: 'label' | 'raw' | 'payload'; label: string; emoji?: string; colorVar: string; meaning: string; }
export const BLOCK_KINDS: readonly BlockKindDef[] = [
  { key: 'label', label: 'label', emoji: CONCEPT_EMOJI.label, colorVar: categoryVar('marker'), meaning: 'A named landmark you jump to — built from marker bits.' },
  { key: 'raw', label: 'raw', colorVar: 'var(--line-2)', meaning: 'An exact opcode byte the source pinned — a hatched grey frame + a "byte" tag; any opcode can appear raw.' },
  { key: 'payload', label: 'target', emoji: '↳', colorVar: 'var(--ink-2)', meaning: 'A jump/find target — the template bytes that follow a control op (takes its colour).' },
];

// The four registers, each with a fixed colour (tokens above) used wherever the register is named.
export type RegisterId = 'A' | 'B' | 'C' | 'D';
export interface RegisterDef { id: RegisterId; role: string; colorVar: string; }
export function registerVar(id: RegisterId): string { return `var(--reg-${id.toLowerCase()})`; }
export const REGISTERS: readonly RegisterDef[] = [
  { id: 'A', role: 'Address — where things sit in the soup.', colorVar: registerVar('A') },
  { id: 'B', role: 'Helper — a second value to work with.', colorVar: registerVar('B') },
  { id: 'C', role: 'Counting box — maths and loop counts land here.', colorVar: registerVar('C') },
  { id: 'D', role: 'Scratch — a spare box.', colorVar: registerVar('D') },
];

// The full opcode roster — every verb, enriched with its glyph. Single-sourced from VOCAB.
export interface OpcodeRow extends VerbEntry { emoji: string; colorVar: string; }
export const OPCODES: readonly OpcodeRow[] = allVerbs().map((v) => ({
  ...v, emoji: opcodeEmoji(v.verb), colorVar: categoryVar(v.category),
}));

/** the opcodes in one category, in roster order. */
export function opcodesInCategory(cat: OpcodeCategory): OpcodeRow[] {
  return OPCODES.filter((o) => o.category === cat);
}
