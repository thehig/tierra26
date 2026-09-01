// The app shell: nav + theme/motion (persisted via the prefs store) + a router that
// dispatches on the current surface.
import { RouterProvider, useRouter, Link, type AppRoute } from './router/router.tsx';
import { PrefsProvider, usePrefs } from './store/prefs.tsx';
import { LanguageModeProvider, useLanguageMode, useLanguageToggle } from './design/languageMode.tsx';
import { Home } from './pages/Home.tsx';
import { LessonPage } from './pages/LessonPage.tsx';
import { WikiIndex, WikiPage } from './pages/Wiki.tsx';
import { SandboxPage } from './pages/Sandbox.tsx';
import { VersusPage } from './pages/Versus.tsx';
import { ConceptPage } from './pages/Concept.tsx';
import { ChapterPage } from './pages/Chapter.tsx';

// A stable identity per distinct page, so client navigation REMOUNTS the page (matching a refresh)
// instead of reusing a same-typed page's stale internal state (e.g. a sandbox's solved/step state).
function routeKey(r: AppRoute | null): string {
  if (!r) return 'home';
  switch (r.surface) {
    case 'lesson': return 'lesson:' + r.lessonId + (r.section ?? '');
    case 'learn': return 'learn:' + r.chapterId;
    case 'wiki': return 'wiki:' + (r.verb ?? '');
    case 'concept': return 'concept:' + r.slug;
    case 'sandbox': return 'sandbox:' + (r.run ? r.run.seed + r.run.genomes.join('|') : '');
    case 'versus': return 'versus:' + (r.run ? r.run.seed + r.run.genomes.join('|') : '');
    default: return 'home';
  }
}

function Surface({ route, dark }: { route: AppRoute | null; dark: boolean }) {
  if (!route) return <Home />;
  switch (route.surface) {
    case 'lesson': return <LessonPage lessonId={route.lessonId} dark={dark} />;
    case 'wiki': return route.verb ? <WikiPage verb={route.verb} dark={dark} /> : <WikiIndex />;
    case 'sandbox': return <SandboxPage dark={dark} />;
    case 'versus': return <VersusPage dark={dark} />;
    case 'concept': return <ConceptPage slug={route.slug} dark={dark} />;
    case 'learn': return <ChapterPage id={route.chapterId} dark={dark} />;
    default: return <Home />;
  }
}

function Chrome() {
  const { route } = useRouter();
  const { theme, dark, setTheme, reducedMotion, setReducedMotion } = usePrefs();
  const lang = useLanguageMode();
  const toggleLang = useLanguageToggle();
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
        <button className="btn ghost" onClick={toggleLang} title="friendly names vs real instruction code">
          {lang === 'simple' ? 'Aa simple' : '⌗ advanced'}
        </button>
        <button className="btn ghost" onClick={() => setReducedMotion(!reducedMotion)} title="reduce motion">
          {reducedMotion ? '❄ still' : '≈ motion'}
        </button>
        <button className="btn ghost" onClick={nextTheme}>◐ {theme}</button>
      </header>
      <Surface key={routeKey(route)} route={route} dark={dark} />
    </div>
  );
}

export default function App() {
  return (
    <PrefsProvider>
      <LanguageModeProvider>
        <RouterProvider>
          <Chrome />
        </RouterProvider>
      </LanguageModeProvider>
    </PrefsProvider>
  );
}
