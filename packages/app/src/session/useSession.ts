// Boots a worker session from a playground recipe and streams frames into React.
// Run state comes ONLY from worker frames (UIINV-VIEW); the main thread never simulates.
// Frames are coalesced to the display refresh via a ref + rAF, so a busy tab drops
// frames without ever desyncing from the worker (UIINV-BACKPRESSURE).
import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from '@tierra26/engine';
import type { Scenario, Injection } from '@tierra26/engine';
import type { HostCommand, WorkerEvent, ObservationFrame } from '@tierra26/ui/protocol.ts';
import { initialSessionState, reduceSession, type SessionState } from './reduce.ts';

export interface PlaygroundBoot {
  scenario: Partial<Scenario>; // memoize at the call site (object identity re-boots the session)
  injections: Injection[];     // creatures placed at cycle 0 (one per founder — simultaneous)
}

export interface SessionApi {
  state: SessionState;
  play(): void;
  pause(): void;
  step(): void;
  reset(): void;
  setSpeed(framesPerSecond: number, instructionsPerFrame: number): void;
  inspect(addr: number): void;
  injectGenome(bytes: Uint8Array): void;
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

    // Boot: create the session, init the soup with all founders placed at cycle 0, set a cadence.
    w.postMessage({ type: 'createSession', engineVersion: Engine.version, sessionId: sid, correlationId: c() });
    w.postMessage({ type: 'init', scenario: boot.scenario, injections: boot.injections, sessionId: sid, correlationId: c() });
    w.postMessage({ type: 'setSpeed', framesPerSecond: 30, instructionsPerFrame: 1500, sessionId: sid, correlationId: c() });
    setState((s) => ({ ...s, status: 'ready' }));

    return () => {
      cancelAnimationFrame(raf);
      try { w.postMessage({ type: 'disposeSession', sessionId: sid, correlationId: c() }); } catch { /* terminating */ }
      w.terminate();
      workerRef.current = null;
    };
    // Re-boot only when the recipe itself changes (both are memoized at the call site).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot.scenario, boot.injections]);

  const play = useCallback(() => { send({ type: 'run', mode: 'play' }); setState((s) => ({ ...s, status: 'playing' })); }, [send]);
  const pause = useCallback(() => { send({ type: 'run', mode: 'pause' }); setState((s) => ({ ...s, status: 'paused' })); }, [send]);
  const step = useCallback(() => { send({ type: 'step' }); }, [send]);
  const reset = useCallback(() => { send({ type: 'reset' }); setState((s) => ({ ...s, status: 'ready', births: 0, deaths: 0 })); }, [send]);
  const setSpeed = useCallback((framesPerSecond: number, instructionsPerFrame: number) => {
    send({ type: 'setSpeed', framesPerSecond, instructionsPerFrame });
  }, [send]);
  const inspect = useCallback((addr: number) => { send({ type: 'requestInspect', addr }); }, [send]);
  const injectGenome = useCallback((bytes: Uint8Array) => { send({ type: 'inject', genome: bytes }); }, [send]);

  return { state, play, pause, step, reset, setSpeed, inspect, injectGenome };
}
