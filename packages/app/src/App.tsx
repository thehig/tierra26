// The app shell: nav + theme/motion (persisted via the prefs store) + a router that
// dispatches on the current surface.
import { RouterProvider, useRouter, Link, type AppRoute } from './router/router.tsx';
import { PrefsProvider, usePrefs } from './store/prefs.tsx';
import { Home } from './pages/Home.tsx';
import { LessonPage } from './pages/LessonPage.tsx';
import { WikiIndex, WikiPage } from './pages/Wiki.tsx';
import { SandboxPage } from './pages/Sandbox.tsx';
import { VersusPage } from './pages/Versus.tsx';
import { ConceptPage } from './pages/Concept.tsx';

function Surface({ route, dark }: { route: AppRoute | null; dark: boolean }) {
  if (!route) return <Home />;
  switch (route.surface) {
    case 'lesson': return <LessonPage lessonId={route.lessonId} dark={dark} />;
    case 'wiki': return route.verb ? <WikiPage verb={route.verb} dark={dark} /> : <WikiIndex />;
    case 'sandbox': return <SandboxPage dark={dark} />;
    case 'versus': return <VersusPage dark={dark} />;
    case 'concept': return <ConceptPage slug={route.slug} />;
    default: return <Home />;
  }
}

function Chrome() {
  const { route } = useRouter();
  const { theme, dark, setTheme, reducedMotion, setReducedMotion } = usePrefs();
  const order: ('system' | 'light' | 'dark')[] = ['system', 'light', 'dark'];
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
        <button className="btn ghost" onClick={() => setReducedMotion(!reducedMotion)} title="reduce motion">
          {reducedMotion ? '❄ still' : '≈ motion'}
        </button>
        <button className="btn ghost" onClick={nextTheme}>◐ {theme}</button>
      </header>
      <Surface route={route} dark={dark} />
    </div>
  );
}

export default function App() {
  return (
    <PrefsProvider>
      <RouterProvider>
        <Chrome />
      </RouterProvider>
    </PrefsProvider>
  );
}
