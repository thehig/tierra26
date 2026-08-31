// Match Model & Scoring (MATCH) — pure, deterministic match logic over engine observables.
// Ref: docs/spec/versus/01-match-model-and-scoring.md (§2 interfaces, §4 rules, §8 MATCH-001..012).
//
// CONTRACT: score/rank/validateMatchConfig are PURE functions of their inputs — no DOM, no clock,
// no Math.random, no float on the verdict path. All populations/scores are integers. This module
// computes scores FROM stats (per-founder live population); it does NOT run the sim (that is the
// Runner [03]). The 2-player scoring core agrees with content `rankVersus` for the same inputs
// (MATCH-012): the founder with more live population wins; an exact tie with no tiebreaker → draw.
//
// NOTE: `--experimental-strip-types` rejects TS parameter properties/enums/decorators/namespaces —
// this module uses plain functions and interfaces; every field is declared explicitly. Types are
// imported with `import type`.

import type {
  FounderId,
  Player,
  Tiebreaker,
  MatchRules,
  MatchConfig,
  Standing,
  MatchHistory,
  MatchResult,
  MatchDescriptor,
} from './types.ts';

// ---------------------------------------------------------------------------
// Scoring (MATCH-003/005/011) — per-founder live population → ranked standings.
// ---------------------------------------------------------------------------

/**
 * score — one Standing per player from the per-founder live population map (0 if absent).
 * PURE. Neutral founder 0 never scores (excluded even if it appears as a player or in the map).
 * Standings are sorted by DESCENDING population; equal populations SHARE a rank (standard
 * competition ranking: 1,2,2,4). All populations are integers.
 */
export function score(
  perFounderPopulation: Map<FounderId, number>,
  players: Player[],
): Standing[] {
  const rows: Standing[] = [];
  for (const p of players) {
    if (p.founderId === 0) continue; // neutral (founder 0) is not a player and never scores
    const pop = perFounderPopulation.get(p.founderId) ?? 0;
    rows.push({ founderId: p.founderId, name: p.name, population: pop, rank: 0 });
  }
  // Descending population; deterministic tie order by ascending founderId (keeps output stable).
  rows.sort((a, b) => b.population - a.population || a.founderId - b.founderId);
  // Standard competition ranking: equal populations share a rank, the next distinct value skips.
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && rows[i]!.population === rows[i - 1]!.population) {
      rows[i]!.rank = rows[i - 1]!.rank;
    } else {
      rows[i]!.rank = i + 1;
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Ranking & tiebreakers (MATCH-006/007/008/010) — decide the winner (or draw).
// ---------------------------------------------------------------------------

// The stop point + replay recipe rank folds into the MatchResult. Passed by the Runner [03] which
// knows where the sim stopped and how to reproduce it. Keeping it a param keeps rank pure.
export interface RankContext {
  atCycle: number;
  atGeneration: number;
  descriptor: MatchDescriptor;
}

// A larger value wins for peak-population/total-births; a SMALLER value wins for
// earliest-threshold-lead (earlier cycle) and smaller-avg-size (smaller genome).
function tiebreakerSmallerWins(tb: Tiebreaker): boolean {
  return tb === 'earliest-threshold-lead' || tb === 'smaller-avg-size';
}

// Read one tiebreaker's recorded observable for a founder (MATCH-007). Absent smaller-wins values
// are treated as +Infinity ("never led" / unknown loses to any recorded value); absent
// larger-wins values default to 0.
function tiebreakerValue(tb: Tiebreaker, id: FounderId, history: MatchHistory): number {
  switch (tb) {
    case 'peak-population':
      return history.peakPopulation.get(id) ?? 0;
    case 'total-births':
      return history.totalBirths.get(id) ?? 0;
    case 'earliest-threshold-lead':
      return history.earliestThresholdLead.get(id) ?? Infinity;
    case 'smaller-avg-size':
      return history.avgSize.get(id) ?? Infinity;
  }
}

// Apply tiebreakers IN ORDER over the tied leaders. Each narrows the candidate set to the best
// value; the first tiebreaker that leaves exactly one candidate decides. Exhausted → draw.
function breakTie(
  leaders: Standing[],
  tiebreakers: Tiebreaker[],
  history: MatchHistory,
): { winner: FounderId | 'draw'; tiebreakerUsed?: Tiebreaker } {
  let candidates = leaders.slice();
  for (const tb of tiebreakers) {
    const smaller = tiebreakerSmallerWins(tb);
    let best = smaller ? Infinity : -Infinity;
    for (const s of candidates) {
      const v = tiebreakerValue(tb, s.founderId, history);
      if (smaller ? v < best : v > best) best = v;
    }
    const next = candidates.filter((s) => tiebreakerValue(tb, s.founderId, history) === best);
    if (next.length === 1) return { winner: next[0]!.founderId, tiebreakerUsed: tb };
    candidates = next; // still tied on this observable — carry the survivors to the next tiebreaker
  }
  return { winner: 'draw' };
}

/**
 * rank — determine the winner from ranked standings (PURE).
 * The sole rank-1 founder wins. If rank-1 is tied, apply `rules.tiebreakers` in order (each reading
 * the matching `history` map); if all are exhausted and still tied → 'draw'. Records
 * `tiebreakerUsed` when a tiebreaker decides, and the stop point / descriptor from `ctx` (MATCH-008).
 * Total extinction (all populations 0) is handled here: every founder is a tied rank-1, so the
 * tiebreakers rank by peak / recorded observables — there is never an undefined winner (MATCH-010).
 */
export function rank(
  standings: Standing[],
  rules: MatchRules,
  history: MatchHistory,
  ctx: RankContext,
): MatchResult {
  const leaders = standings.filter((s) => s.rank === 1);
  let winner: FounderId | 'draw';
  let tiebreakerUsed: Tiebreaker | undefined;

  if (leaders.length === 1) {
    winner = leaders[0]!.founderId; // sole rank-1 founder wins outright
  } else if (leaders.length === 0) {
    winner = 'draw'; // no players/standings at all — degenerate, never undefined
  } else {
    const decided = breakTie(leaders, rules.tiebreakers, history);
    winner = decided.winner;
    tiebreakerUsed = decided.tiebreakerUsed;
  }

  return {
    standings,
    winner,
    atCycle: ctx.atCycle,
    atGeneration: ctx.atGeneration,
    tiebreakerUsed,
    descriptor: ctx.descriptor,
  };
}

// ---------------------------------------------------------------------------
// Config validation (MATCH-001/002) — reject invalid matches; [] means valid.
// ---------------------------------------------------------------------------

/**
 * validateMatchConfig — returns the reasons a MatchConfig is invalid ([] = valid). PURE.
 * Rejects: fewer than 2 players, duplicate founderIds, duplicate genomes, founder 0 used as a
 * player, and a wall-clock threshold (only the in-sim clocks 'cycles'/'generations' are allowed).
 */
export function validateMatchConfig(cfg: MatchConfig): string[] {
  const reasons: string[] = [];
  const players = cfg.players ?? [];

  if (players.length < 2) reasons.push('a match needs at least 2 players');

  const seenIds = new Set<FounderId>();
  const seenGenomes = new Set<string>();
  for (const p of players) {
    if (p.founderId === 0) {
      reasons.push('founder 0 is the neutral lineage and cannot be a player');
    }
    if (seenIds.has(p.founderId)) {
      reasons.push(`duplicate founderId ${p.founderId} — each player needs a distinct founderId`);
    }
    seenIds.add(p.founderId);
    if (seenGenomes.has(p.genome)) {
      reasons.push('duplicate genome — each player must have a distinct genome');
    }
    seenGenomes.add(p.genome);
  }

  const kind = cfg.rules?.threshold?.kind as string | undefined;
  if (kind !== 'cycles' && kind !== 'generations') {
    reasons.push(`threshold must be an in-sim clock ('cycles' or 'generations'), never wall-clock (got ${String(kind)})`);
  }

  return reasons;
}
