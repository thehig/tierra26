// The app shell: top bar + theme, hosting the first-slice Playground.
import { useEffect, useState } from 'react';
import { Playground } from './playground/Playground.tsx';

type Theme = 'system' | 'light' | 'dark';

function useDark(theme: Theme): boolean {
  const [dark, setDark] = useState(() =>
    theme === 'dark' || (theme === 'system' &&
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches));
  useEffect(() => {
    if (theme !== 'system') { setDark(theme === 'dark'); return; }
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
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

  const order: Theme[] = ['system', 'light', 'dark'];
  const nextTheme = () => setTheme(order[(order.indexOf(theme) + 1) % order.length]!);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="dot" /> tierra26</div>
        <div className="tagline">digital soup · playground</div>
        <button className="btn ghost" onClick={nextTheme}>◐ {theme}</button>
      </header>
      <Playground dark={dark} />
    </div>
  );
}
