// Keyword & Tooltip System (KEYWORD) — acceptance tests.
// Ref: docs/spec/content/04-keyword-and-tooltip-system.md §8 (KEYWORD-NNN).
// The color-coded, hoverable term registry that powers Nintendo-style highlighting across all
// prose. Verb entries are DERIVED from GeneScript VOCAB (term/color/kid/machine), NOT copied
// (C-CON-SOURCE); concept nouns (soup, daughter, template, parasite, reaper, slicer, genotype,
// mutation, ...) are defined here. Auto-linking is deterministic: longest-match, case-insensitive,
// word-boundary-respecting; {term} forces, {!word} suppresses; code spans are never linked; and
// only registry terms are ever linked (CONTINV-KEYWORDS). Tooltips are plain language (C-CON-KID).
// This doc is the CONTRACT; rendering lives in the UI layer.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KEYWORDS, resolveKeywords, lookupKeyword, findUnknownForces } from '../src/keyword.ts';
import { VOCAB, allVerbs, entryOfMnemonic } from '../../genescript/src/vocab.ts';

const REQUIRED_CONCEPTS = ['soup', 'daughter', 'template', 'genome', 'genotype', 'mutation', 'parasite', 'reaper', 'slicer'];
const ROLES = ['action', 'register', 'marker', 'control', 'value', 'concept'];

const verbEntries = () => KEYWORDS.filter((e) => e.kind === 'verb');
const conceptEntries = () => KEYWORDS.filter((e) => e.kind === 'concept');

describe('Keyword & Tooltip System (KEYWORD)', () => {
  it('[KEYWORD-001] every classic-32 GeneScript verb has exactly one keyword entry (kind: verb); no orphan verb (contributes CONTINV-COVERAGE)', () => {
    const verbs = verbEntries();
    assert.equal(verbs.length, 32, 'exactly 32 verb entries');
    assert.equal(allVerbs().length, 32);
    // exactly one entry per VOCAB verb term, and no verb term outside VOCAB.
    const vocabTerms = new Set(VOCAB.map((v) => v.verb));
    const seen = new Map<string, number>();
    for (const e of verbs) {
      assert.ok(vocabTerms.has(e.term), `${e.term} is a VOCAB verb`);
      seen.set(e.term, (seen.get(e.term) ?? 0) + 1);
    }
    for (const term of vocabTerms) assert.equal(seen.get(term), 1, `exactly one entry for ${term}`);
  });

  it('[KEYWORD-002] every verb entry joins to a real VOCAB mnemonic and the join is a bijection verb<->VOCAB entry', () => {
    const verbs = verbEntries();
    const vocabMnemonics = new Set(VOCAB.map((v) => v.mnemonic));
    const usedMnemonics = new Set<string>();
    for (const e of verbs) {
      assert.ok(e.mnemonic, `${e.term} carries a mnemonic`);
      assert.ok(vocabMnemonics.has(e.mnemonic!), `${e.mnemonic} is a real VOCAB mnemonic`);
      const joined = entryOfMnemonic(e.mnemonic!);
      assert.ok(joined, `${e.mnemonic} joins to a VOCAB entry`);
      assert.equal(joined!.verb, e.term, 'join maps back to the same verb');
      assert.equal(usedMnemonics.has(e.mnemonic!), false, `${e.mnemonic} used once (injective)`);
      usedMnemonics.add(e.mnemonic!);
    }
    // surjective: every VOCAB mnemonic is claimed by exactly one entry.
    assert.equal(usedMnemonics.size, vocabMnemonics.size, 'bijection: every VOCAB mnemonic joined');
  });

  it('[KEYWORD-003] every required concept noun (soup/daughter/template/genome/genotype/mutation/parasite/reaper/slicer) has exactly one entry (kind: concept)', () => {
    for (const noun of REQUIRED_CONCEPTS) {
      const matches = conceptEntries().filter((e) => e.term === noun);
      assert.equal(matches.length, 1, `exactly one concept entry for ${noun}`);
      assert.equal(matches[0]!.kind, 'concept');
    }
  });

  it('[KEYWORD-004] all term values are globally unique, and every alias is unique and collides with no other term or alias (term->entry map is unambiguous)', () => {
    const surfaces = new Map<string, number>();
    for (const e of KEYWORDS) {
      const forms = [e.term, ...(e.aliases ?? [])];
      for (const f of forms) {
        const key = f.toLowerCase();
        surfaces.set(key, (surfaces.get(key) ?? 0) + 1);
      }
    }
    for (const [surface, count] of surfaces) assert.equal(count, 1, `surface '${surface}' is globally unique`);
    // the resulting lookup map is unambiguous: each surface resolves to exactly one entry.
    for (const e of KEYWORDS) {
      for (const f of [e.term, ...(e.aliases ?? [])]) {
        assert.equal(lookupKeyword(f)!.term, e.term, `'${f}' resolves to ${e.term}`);
      }
    }
  });

  it('[KEYWORD-005] every category is one of action/register/marker/control/value/concept; a verb entry category equals its VOCAB category and every concept entry is concept', () => {
    for (const e of KEYWORDS) assert.ok(ROLES.includes(e.category), `${e.term} category ${e.category} is a valid role`);
    for (const e of verbEntries()) {
      const v = entryOfMnemonic(e.mnemonic!)!;
      assert.equal(e.category, v.category, `${e.term} category equals its VOCAB category`);
    }
    for (const e of conceptEntries()) assert.equal(e.category, 'concept', `${e.term} is concept`);
  });

  it('[KEYWORD-006] every entry has a non-empty tooltip.kid in plain language (no mnemonic string, no register-letter jargon, no word "opcode" — C-CON-KID) and a non-empty tooltip.more', () => {
    const mnemonics = VOCAB.map((v) => v.mnemonic);
    // Every entry: non-empty kid + more, and no "opcode" anywhere.
    for (const e of KEYWORDS) {
      assert.ok(e.tooltip.kid.trim().length > 0, `${e.term} has a non-empty kid`);
      assert.ok(e.tooltip.more.trim().length > 0, `${e.term} has a non-empty more`);
      assert.equal(/\bopcode\b/i.test(e.tooltip.kid), false, `${e.term} kid avoids "opcode"`);
    }
    // Concept kids are authored HERE and must clear the stricter no-jargon bar: no machine
    // mnemonic string and no bare register letter (B/C/D). (Verb kids are inherited verbatim from
    // VOCAB — its own single source, already C-GS-KID/C-CON-KID; English homonyms like "zero" or
    // the article "A" are not jargon and are not policed here.)
    for (const e of conceptEntries()) {
      const kidLower = e.tooltip.kid.toLowerCase();
      for (const mn of mnemonics) {
        assert.equal(new RegExp(`\\b${mn.toLowerCase()}\\b`).test(kidLower), false, `${e.term} kid avoids the mnemonic '${mn}'`);
      }
      assert.equal(/\b[BCD]\b/.test(e.tooltip.kid), false, `${e.term} kid has no bare register letter`);
    }
  });

  it('[KEYWORD-007] verb entries DERIVE term/color/kid/more from VOCAB (joined by mnemonic), not an independent copy: term==VOCAB.verb, category==VOCAB.category, kid==VOCAB.tooltip.kid, more==VOCAB.tooltip.machine (C-CON-SOURCE)', () => {
    for (const e of verbEntries()) {
      const v = entryOfMnemonic(e.mnemonic!)!;
      assert.equal(e.term, v.verb, 'term == VOCAB.verb');
      assert.equal(e.category, v.category, 'category == VOCAB.category');
      assert.equal(e.tooltip.kid, v.kid, 'kid == VOCAB.kid');
      assert.equal(e.tooltip.more, v.machine, 'more == VOCAB.machine');
    }
  });

  it('[KEYWORD-008] auto-linking is longest-match: where two terms/aliases match at a position (daughter cell vs daughter), the longest surface form links and the scan resumes past it (no nested double-link)', () => {
    const prose = 'the daughter cell grows';
    const spans = resolveKeywords(prose, KEYWORDS);
    const daughters = spans.filter((s) => s.term === 'daughter');
    assert.equal(daughters.length, 1, 'exactly one span (no nested double-link)');
    const s = daughters[0]!;
    assert.equal(prose.slice(s.start, s.end), 'daughter cell', 'longest surface "daughter cell" is linked');
    // resumed past the match: "cell" is not separately re-scanned inside the span.
    assert.equal(spans.filter((x) => prose.slice(x.start, x.end) === 'daughter').length, 0);
  });

  it('[KEYWORD-009] an explicit {term} forces a link to that entry (overriding auto-scan), and a {term} naming an unknown term is an authoring error at validate time', () => {
    // force resolves to the entry, span covers the inner term, canonical term reported.
    const prose = 'go to the {soup} now';
    const spans = resolveKeywords(prose, KEYWORDS);
    assert.equal(spans.length, 1);
    assert.equal(spans[0]!.term, 'soup');
    assert.equal(prose.slice(spans[0]!.start, spans[0]!.end), 'soup');
    // force also links a term auto-scan would otherwise leave plain? force works on an alias too.
    const aliased = resolveKeywords('the {tank} is warm', KEYWORDS);
    assert.equal(aliased[0]!.term, 'soup', 'force via alias resolves to canonical entry');
    // an unknown {term} is an authoring error surfaced at validate time (resolver emits no span).
    assert.deepEqual(findUnknownForces('meet the {glorble} here', KEYWORDS), ['glorble']);
    assert.equal(resolveKeywords('meet the {glorble} here', KEYWORDS).length, 0);
    // a known force is NOT flagged as an error.
    assert.deepEqual(findUnknownForces('go to the {soup}', KEYWORDS), []);
  });

  it('[KEYWORD-010] an explicit {!word} suppresses linking: the word renders literally with no span, even when it is a known registry term', () => {
    const spans = resolveKeywords('do not link {!soup} here', KEYWORDS);
    assert.equal(spans.length, 0, 'suppressed term yields no span');
    // and it is not an authoring error even for a real term.
    assert.deepEqual(findUnknownForces('do not link {!soup} here', KEYWORDS), []);
    // the same word without suppression WOULD link — proving the suppression did the work.
    assert.equal(resolveKeywords('the soup here', KEYWORDS).length, 1);
  });

  it('[KEYWORD-011] text inside inline code (`verb`) and fenced code blocks is never auto-linked (code spans are inviolate)', () => {
    // inline code: soup inside backticks is not linked; soup outside is.
    const inline = 'the `soup` word but soup here';
    const spans = resolveKeywords(inline, KEYWORDS);
    assert.equal(spans.length, 1, 'only the out-of-code soup links');
    assert.ok(spans[0]!.start > inline.indexOf('`soup`'), 'the linked soup is the one after the code span');
    // fenced code block: nothing inside links; even a {term} force inside code is literal.
    const fenced = 'before soup\n```\nsoup and {daughter}\n```\nafter soup';
    const fspans = resolveKeywords(fenced, KEYWORDS);
    assert.equal(fspans.length, 2, 'only the two out-of-fence soups link');
    for (const s of fspans) assert.equal(fenced.slice(s.start, s.end), 'soup');
  });

  it('[KEYWORD-012] auto-linking only links registry terms/aliases and is deterministic: the same (prose, registry) yields the identical ordered span list; unknown words are left plain (CONTINV-KEYWORDS)', () => {
    const prose = 'the soup holds a genome that becomes a parasite; xyzzy is plain';
    const a = resolveKeywords(prose, KEYWORDS);
    const b = resolveKeywords(prose, KEYWORDS);
    assert.deepEqual(a, b, 'identical inputs -> identical ordered output');
    // ascending source order.
    for (let i = 1; i < a.length; i++) assert.ok(a[i]!.start > a[i - 1]!.start, 'spans in ascending start order');
    // only registry terms linked; unknown word "xyzzy" left plain.
    const linked = a.map((s) => prose.slice(s.start, s.end).toLowerCase());
    assert.deepEqual(linked, ['soup', 'genome', 'parasite']);
    assert.equal(a.some((s) => prose.slice(s.start, s.end).includes('xyzzy')), false);
    for (const s of a) assert.ok(lookupKeyword(prose.slice(s.start, s.end)), 'every span is a registry surface');
  });

  it('[KEYWORD-013] matching is case-insensitive and word-boundary-respecting: SOUP/Soup resolve to soup, and a term is not linked inside a larger word (copy in copyright is plain)', () => {
    for (const surface of ['SOUP', 'Soup', 'sOuP']) {
      const spans = resolveKeywords(`a ${surface} here`, KEYWORDS);
      assert.equal(spans.length, 1, `${surface} resolves`);
      assert.equal(spans[0]!.term, 'soup', `${surface} -> canonical soup`);
    }
    // word boundary: no verb/alias links inside a larger word.
    assert.equal(resolveKeywords('the copyright notice', KEYWORDS).filter((s) => s.term.startsWith('copy')).length, 0);
    assert.equal(resolveKeywords('soupy noodles', KEYWORDS).length, 0, 'soup not linked inside "soupy"');
    // but a clean boundary (punctuation) does link.
    assert.equal(resolveKeywords('the soup.', KEYWORDS).length, 1, 'trailing punctuation is a boundary');
  });
});
