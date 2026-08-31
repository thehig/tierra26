// The engine runs HERE, on its own thread. This wrapper turns the pure, synchronous
// worker-core (already tested in @tierra26/ui) into a real message-driven Web Worker:
// commands in → events out, plus a self-driven pump loop for free-run ('play').
import { createWorkerCore } from '@tierra26/ui/worker-core';
import type { HostCommand, WorkerEvent } from '@tierra26/ui/protocol';

const core = createWorkerCore();
const playing = new Set<string>(); // sessionIds currently free-running
let timer: ReturnType<typeof setTimeout> | null = null;
const FRAME_MS = 33; // ~30fps host cadence; instructions-per-frame is set via setSpeed

function emit(events: WorkerEvent[]): void {
  for (const ev of events) (self as unknown as Worker).postMessage(ev);
}

function loop(): void {
  timer = null;
  if (playing.size === 0) return;
  for (const sid of playing) emit(core.pump(sid, 1));
  timer = setTimeout(loop, FRAME_MS);
}
function ensureLoop(): void {
  if (timer === null && playing.size > 0) timer = setTimeout(loop, FRAME_MS);
}

self.onmessage = (e: MessageEvent<HostCommand>): void => {
  const cmd = e.data;
  emit(core.handle(cmd));
  if (cmd.type === 'run') {
    if (cmd.mode === 'play') { playing.add(cmd.sessionId); ensureLoop(); }
    else playing.delete(cmd.sessionId); // pause / budget stop the free-run loop
  } else if (cmd.type === 'reset' || cmd.type === 'disposeSession') {
    playing.delete(cmd.sessionId);
  }
};
