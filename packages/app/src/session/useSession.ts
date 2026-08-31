// Boots a worker session from a playground recipe and streams frames into React.
// Run state comes ONLY from worker frames (UIINV-VIEW); the main thread never simulates.
// Frames are coalesced to the display refresh via a ref + rAF, so a busy tab drops
// frames without ever desyncing from the worker (UIINV-BACKPRESSURE).
import { useCallback, useEffect, useRef, useState } from 'react';
import { compile } from '@tierra26/genescript/comp.ts';
import { classic32 } from '@tierra26/engine/isa.ts';
import { Engine } from '@tierra26/engine';
import type { HostCommand, WorkerEvent, ObservationFrame } from '@tierra26/ui/protocol.ts';
import { initialSessionState, reduceSession, type SessionState } from './reduce.ts';

export interface PlaygroundBoot {
  seed: number;
  soupSize?: number;
  source: string; // GeneScript starter
}

export interface SessionApi {
  state: SessionState;
  play(): void;
  pause(): void;
  step(): void;
  reset(): void;
  setSpeed(framesPerSecond: number, instructionsPerFrame: number): void;
}

export function useSession(boot: PlaygroundBoot): SessionApi {
  const workerRef = useRef<Worker | null>(null);
  const sidRef = useRef<string>('s' + Math.random().toString(36).slice(2));
  const corrRef = useRef(0);
  const frameRef = useRef<ObservationFrame | null>(null);
  const [state, setState] = useState<SessionState>(initialSessionState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback((cmd: Omit<HostCommand, 'sessionId' | 'correlationId'>) => {
    const w = workerRef.current;
    if (!w) return;
    w.postMessage({ ...cmd, sessionId: sidRef.current, correlationId: 'c' + corrRef.current++ });
  }, []);

  useEffect(() => {
    if (typeof Worker === 'undefined') return; // guard non-browser (tests/SSR)
    const w = new Worker(new URL('../worker/engine.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    const sid = sidRef.current;
    const c = () => 'c' + corrRef.current++;

    w.onmessage = (e: MessageEvent<WorkerEvent>) => {
      const ev = e.data;
      if (ev.type === 'frame') frameRef.current = ev.frame; // coalesced below
      else setState((s) => reduceSession(s, ev));
    };

    // Push the latest worker frame into React state at display rate.
    let raf = requestAnimationFrame(function tick() {
      const f = frameRef.current;
      if (f && f !== stateRef.current.frame) {
        setState((s) => ({ ...s, frame: f, cycle: f.cycles }));
      }
      raf = requestAnimationFrame(tick);
    });

    // Boot: compile the starter, create the session, init the soup, inject, set a lively cadence.
    const bytes = compile(boot.source, classic32).bytes;
    w.postMessage({ type: 'createSession', engineVersion: Engine.version, sessionId: sid, correlationId: c() });
    w.postMessage({ type: 'init', scenario: { seed: boot.seed, soupSize: boot.soupSize ?? 30000, mutation: { flaw: 0, copy: 0, cosmic: 0 } }, sessionId: sid, correlationId: c() });
    w.postMessage({ type: 'inject', genome: bytes, sessionId: sid, correlationId: c() });
    w.postMessage({ type: 'setSpeed', framesPerSecond: 30, instructionsPerFrame: 1500, sessionId: sid, correlationId: c() });
    setState((s) => ({ ...s, status: 'ready' }));

    return () => {
      cancelAnimationFrame(raf);
      try { w.postMessage({ type: 'disposeSession', sessionId: sid, correlationId: c() }); } catch { /* terminating */ }
      w.terminate();
      workerRef.current = null;
    };
    // Re-boot only when the recipe itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot.source, boot.seed, boot.soupSize]);

  const play = useCallback(() => { send({ type: 'run', mode: 'play' }); setState((s) => ({ ...s, status: 'playing' })); }, [send]);
  const pause = useCallback(() => { send({ type: 'run', mode: 'pause' }); setState((s) => ({ ...s, status: 'paused' })); }, [send]);
  const step = useCallback(() => { send({ type: 'step' }); }, [send]);
  const reset = useCallback(() => { send({ type: 'reset' }); setState((s) => ({ ...s, status: 'ready', births: 0, deaths: 0 })); }, [send]);
  const setSpeed = useCallback((framesPerSecond: number, instructionsPerFrame: number) => {
    send({ type: 'setSpeed', framesPerSecond, instructionsPerFrame });
  }, [send]);

  return { state, play, pause, step, reset, setSpeed };
}
