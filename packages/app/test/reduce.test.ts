import { describe, it, expect } from 'vitest';
import { reduceSession, initialSessionState, type SessionState } from '../src/session/reduce.ts';

const S = 'v';
const frame = (cycles: number, population: number) =>
  ({ type: 'frame', sessionId: S, seq: cycles, frame: { cycles, stats: { cycles, population } } }) as any;

describe('session reducer', () => {
  it('a frame advances the cycle and stores the frame', () => {
    const s = reduceSession(initialSessionState, frame(1200, 7));
    expect(s.cycle).toBe(1200);
    expect(s.frame?.stats.population).toBe(7);
  });

  it('birth and death events tally', () => {
    let s: SessionState = initialSessionState;
    s = reduceSession(s, { type: 'birth', sessionId: S, creatureId: 2, genotypeId: 1, cycle: 5 } as any);
    s = reduceSession(s, { type: 'birth', sessionId: S, creatureId: 3, genotypeId: 1, cycle: 6 } as any);
    s = reduceSession(s, { type: 'death', sessionId: S, creatureId: 2, cycle: 9 } as any);
    expect(s.births).toBe(2);
    expect(s.deaths).toBe(1);
  });

  it('an error event surfaces its message', () => {
    const s = reduceSession(initialSessionState, { type: 'error', sessionId: S, code: 'ENGINE_ERROR', message: 'boom', fatal: false } as any);
    expect(s.error).toBe('boom');
  });

  it('is pure — the input state is not mutated', () => {
    const before = { ...initialSessionState };
    reduceSession(initialSessionState, frame(10, 1));
    expect(initialSessionState).toEqual(before);
  });

  it('ignores acks and unknown events', () => {
    const s = reduceSession(initialSessionState, { type: 'ack', sessionId: S, command: 'step' } as any);
    expect(s).toEqual(initialSessionState);
  });
});
