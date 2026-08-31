// M-A / early M-B: a live playground shell. Boots the ancestor in a real Web Worker,
// streams frames, and renders the tank + HUD + controls. Editor/inspector/charts land next.
import { useEffect, useState } from 'react';
import { ANCESTOR_GS } from '@tierra26/genescript/ancestor.gs.ts';
import { useSession } from './session/useSession.ts';
import { TankCanvas } from './ui/TankCanvas.tsx';
import { Hud } from './ui/Hud.tsx';
import { Controls } from './ui/Controls.tsx';

type Theme = 'system' | 'light' | 'dark';

function useDark(theme: Theme): boolean {
  const [dark, setDark] = useState(() =>
    theme === 'dark' || (theme === 'system' &&
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches));
  useEffect(() => {
    if (theme === 'system') {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const on = () => setDark(mq.matches);
      on(); mq.addEventListener('change', on);
      return () => mq.removeEventListener('change', on);
    }
    setDark(theme === 'dark');
  }, [theme]);
  return dark;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>('system');
  const dark = useDark(theme);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);

  const session = useSession({ seed: 1, soupSize: 30000, source: ANCESTOR_GS });

  const cycle = (['system', 'light', 'dark'] as Theme[]);
  const nextTheme = () => setTheme(cycle[(cycle.indexOf(theme) + 1) % cycle.length]!);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="dot" /> tierra26</div>
        <div className="tagline">digital soup</div>
        <button className="btn ghost" onClick={nextTheme}>◐ {theme}</button>
      </header>

      <main className="stage">
        <section className="tankpanel">
          <div className="tankwrap"><TankCanvas frame={session.state.frame} dark={dark} /></div>
          <Controls api={session} />
        </section>
        <aside className="side">
          <Hud state={session.state} />
          <p className="note">
            The 80-byte ancestor is breeding true in a real engine on its own thread. Editor,
            inspector, and charts arrive next — this is the live loop they'll plug into.
          </p>
        </aside>
      </main>
    </div>
  );
}
