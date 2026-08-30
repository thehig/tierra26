// Keyword & Tooltip System (KEYWORD) — pending acceptance tests.
// Ref: docs/spec/content/04-keyword-and-tooltip-system.md §8 (KEYWORD-NNN).
// The color-coded, hoverable term registry that powers Nintendo-style highlighting across all
// prose. Verb entries are DERIVED from GeneScript VOCAB (term/color/kid/machine), NOT copied
// (C-CON-SOURCE); concept nouns (soup, daughter, template, parasite, reaper, slicer, genotype,
// mutation, ...) are defined here. Auto-linking is deterministic: longest-match, case-insensitive,
// word-boundary-respecting; {term} forces, {!word} suppresses; code spans are never linked; and
// only registry terms are ever linked (CONTINV-KEYWORDS). Tooltips are plain language (C-CON-KID).
// This doc is the CONTRACT; rendering lives in the UI layer.
//
// Pending until the keyword registry/resolver exist; encoded as node:test todo tests (spec-as-checklist).
// NO src imports yet (the modules don't exist — an import error would fail the file).
// When implemented, replace `it.todo(name)` with `it(name, () => { ... })`.
import { describe, it } from 'node:test';

describe('Keyword & Tooltip System (KEYWORD)', () => {
  it.todo('[KEYWORD-001] every classic-32 GeneScript verb has exactly one keyword entry (kind: verb); no orphan verb (contributes CONTINV-COVERAGE)');
  it.todo('[KEYWORD-002] every verb entry joins to a real VOCAB mnemonic and the join is a bijection verb<->VOCAB entry');
  it.todo('[KEYWORD-003] every required concept noun (soup/daughter/template/genome/genotype/mutation/parasite/reaper/slicer) has exactly one entry (kind: concept)');
  it.todo('[KEYWORD-004] all term values are globally unique, and every alias is unique and collides with no other term or alias (term->entry map is unambiguous)');
  it.todo('[KEYWORD-005] every category is one of action/register/marker/control/value/concept; a verb entry category equals its VOCAB category and every concept entry is concept');
  it.todo('[KEYWORD-006] every entry has a non-empty tooltip.kid in plain language (no mnemonic string, no register-letter jargon, no word "opcode" — C-CON-KID) and a non-empty tooltip.more');
  it.todo('[KEYWORD-007] verb entries DERIVE term/color/kid/more from VOCAB (joined by mnemonic), not an independent copy: term==VOCAB.verb, category==VOCAB.category, kid==VOCAB.tooltip.kid, more==VOCAB.tooltip.machine (C-CON-SOURCE)');
  it.todo('[KEYWORD-008] auto-linking is longest-match: where two terms/aliases match at a position (daughter cell vs daughter), the longest surface form links and the scan resumes past it (no nested double-link)');
  it.todo('[KEYWORD-009] an explicit {term} forces a link to that entry (overriding auto-scan), and a {term} naming an unknown term is an authoring error at validate time');
  it.todo('[KEYWORD-010] an explicit {!word} suppresses linking: the word renders literally with no span, even when it is a known registry term');
  it.todo('[KEYWORD-011] text inside inline code (`verb`) and fenced code blocks is never auto-linked (code spans are inviolate)');
  it.todo('[KEYWORD-012] auto-linking only links registry terms/aliases and is deterministic: the same (prose, registry) yields the identical ordered span list; unknown words are left plain (CONTINV-KEYWORDS)');
  it.todo('[KEYWORD-013] matching is case-insensitive and word-boundary-respecting: SOUP/Soup resolve to soup, and a term is not linked inside a larger word (copy in copyright is plain)');
});
