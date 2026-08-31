// Runs a MatchDescriptor in the versus worker and surfaces the result.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchDescriptor, MatchResult } from '@tierra26/versus/types.ts';
import type { MatchWorkerOut } from './versus.worker.ts';

export interface MatchApi {
  result: MatchResult | null;
  running: boolean;
  error: string | null;
  run(desc: MatchDescriptor): void;
  clear(): void;
}

export function useMatch(): MatchApi {
  const workerRef = useRef<Worker | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const w = new Worker(new URL('./versus.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<MatchWorkerOut>) => {
      setRunning(false);
      if (e.data.ok) { setResult(e.data.result); setError(null); }
      else { setError(e.data.error); }
    };
    return () => { w.terminate(); workerRef.current = null; };
  }, []);

  const run = useCallback((desc: MatchDescriptor) => {
    setResult(null); setError(null); setRunning(true);
    workerRef.current?.postMessage(desc);
  }, []);
  const clear = useCallback(() => { setResult(null); setError(null); setRunning(false); }, []);

  return { result, running, error, run, clear };
}
