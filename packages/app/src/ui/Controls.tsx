// Every button is a worker command; the control bar holds no run state of its own.
import type { SessionApi } from '../session/useSession.ts';

const SPEEDS: [string, number][] = [
  ['slow', 300], ['normal', 1500], ['fast', 6000], ['max', 24000],
];

export function Controls({ api }: { api: SessionApi }) {
  const playing = api.state.status === 'playing';
  return (
    <div className="controls" role="toolbar" aria-label="playback">
      <button className="btn primary" onClick={() => (playing ? api.pause() : api.play())}>
        {playing ? '❚❚ Pause' : '▶ Play'}
      </button>
      <button className="btn" onClick={() => api.step()} disabled={playing}>⇥ Step</button>
      <button className="btn" onClick={() => api.reset()}>↺ Reset</button>
      <span className="spacer" />
      <label className="speed">
        speed
        <select
          onChange={(e) => api.setSpeed(30, Number(e.target.value))}
          defaultValue={1500}
          aria-label="simulation speed"
        >
          {SPEEDS.map(([label, ipf]) => (
            <option value={ipf} key={label}>{label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
