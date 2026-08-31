// Runs the authoritative match off the UI thread. runMatch drives its own worker-core
// (the engine) synchronously and returns the deterministic MatchResult; we post it back.
import { runMatch } from '@tierra26/versus/runner.ts';
import type { MatchDescriptor, MatchResult } from '@tierra26/versus/types.ts';

export type MatchWorkerOut =
  | { ok: true; result: MatchResult }
  | { ok: false; error: string };

self.onmessage = async (e: MessageEvent<MatchDescriptor>) => {
  try {
    const result = await runMatch(e.data).result;
    (self as unknown as Worker).postMessage({ ok: true, result } satisfies MatchWorkerOut);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String((err as Error)?.message ?? err) } satisfies MatchWorkerOut);
  }
};
