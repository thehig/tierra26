// The app shell: nav + theme + a router that dispatches on the current surface.
import { useEffect, useState } from 'react';
import type { Route } from '@tierra26/ui/shell.ts';
import { RouterProvider, useRouter, Link } from './router/router.tsx';
import { Home } from './pages/Home.tsx';
import { LessonPage } from './pages/LessonPage.tsx';
import { WikiIndex, WikiPage } from './pages/Wiki.tsx';
import { SandboxPage } from './pages/Sandbox.tsx';
import { VersusPage } from './pages/Versus.tsx';

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

function Surface({ route, dark }: { route: Route | null; dark: boolean }) {
  if (!route) return <Home />;
  switch (route.surface) {
    case 'lesson': return <LessonPage lessonId={route.lessonId} dark={dark} />;
    case 'wiki': return route.verb ? <WikiPage verb={route.verb} dark={dark} /> : <WikiIndex />;
    case 'sandbox': return <SandboxPage dark={dark} />;
    case 'versus': return <VersusPage dark={dark} />;
    default: return <Home />;
  }
}

function Chrome({ dark, theme, setTheme }: { dark: boolean; theme: Theme; setTheme: (t: Theme) => void }) {
  const { route } = useRouter();
  const order: Theme[] = ['system', 'light', 'dark'];
  const nextTheme = () => setTheme(order[(order.indexOf(theme) + 1) % order.length]!);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="home" className="brand"><span className="dot" /> tierra26</Link>
        <nav className="mainnav">
          <Link to={{ surface: 'sandbox' }}>Sandbox</Link>
          <Link to={{ surface: 'wiki' }}>Instructions</Link>
          <Link to={{ surface: 'versus' }}>Versus</Link>
        </nav>
        <button className="btn ghost" onClick={nextTheme}>◐ {theme}</button>
      </header>
      <Surface route={route} dark={dark} />
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>('system');
  const dark = useDark(theme);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);
  return (
    <RouterProvider>
      <Chrome dark={dark} theme={theme} setTheme={setTheme} />
    </RouterProvider>
  );
}
