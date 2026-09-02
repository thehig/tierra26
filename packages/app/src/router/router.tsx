// A tiny history router over the shell's Route type. `null` route === the home lobby.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { pathToRoute, routeToPath, type Route } from '@tierra26/ui/shell.ts';

// The app adds `concept` (explainer pages) and `learn` (the brick-by-brick chapters) surfaces.
export type ConceptRoute = { surface: 'concept'; slug: string };
export type LearnRoute = { surface: 'learn'; chapterId: string };
export type AppRoute = Route | ConceptRoute | LearnRoute;
type Target = AppRoute | 'home';

interface RouterCtx {
  route: AppRoute | null;
  navigate: (to: Target) => void;
}

const Ctx = createContext<RouterCtx>({ route: null, navigate: () => {} });

// Where the app is mounted. Vite guarantees BASE_URL starts and ends with '/',
// so it is '/' for a normal deploy and '/tierra26/' on GitHub Pages, which
// serves a project site from a sub-path. Every route this module produces is a
// site path ('/bible/mal'); `href` and `location` are base paths
// ('/tierra26/bible/mal'). Keeping the two apart here means no other module has
// to know the app is not at the root.
const BASE = import.meta.env.BASE_URL || '/';

/** site path -> the URL to put in an href / history entry. */
function toHref(sitePath: string): string {
  return BASE === '/' ? sitePath : BASE.replace(/\/$/, '') + sitePath;
}

/** the current URL -> a site path. */
function toSitePath(loc: string): string {
  if (BASE !== '/') {
    const prefix = BASE.replace(/\/$/, '');
    if (loc === prefix) return '/';
    if (loc.startsWith(prefix + '/')) return loc.slice(prefix.length);
  }
  return loc;
}

function pathOf(to: Target): string {
  if (to === 'home') return '/';
  if (to.surface === 'concept') return '/concept/' + encodeURIComponent(to.slug);
  if (to.surface === 'learn') return '/learn/' + encodeURIComponent(to.chapterId);
  return routeToPath(to);
}
function routeOf(path: string): AppRoute | null {
  if (/^\/meet\/?/.test(path)) return { surface: 'learn', chapterId: 'meet' }; // legacy alias
  const learnMatch = /^\/learn\/([^/?#]+)/.exec(path);
  if (learnMatch) return { surface: 'learn', chapterId: decodeURIComponent(learnMatch[1]!) };
  const conceptMatch = /^\/concept\/([^/?#]+)/.exec(path);
  if (conceptMatch) return { surface: 'concept', slug: decodeURIComponent(conceptMatch[1]!) };
  return pathToRoute(path);
}
function currentPath(): string {
  if (typeof location === 'undefined') return '/';
  return toSitePath(location.pathname) + location.search;
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(currentPath);
  useEffect(() => {
    const on = () => setPath(currentPath());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const navigate = useCallback((to: Target) => {
    const p = pathOf(to);
    history.pushState({}, '', toHref(p));
    setPath(p);
    window.scrollTo(0, 0);
  }, []);
  return <Ctx.Provider value={{ route: routeOf(path), navigate }}>{children}</Ctx.Provider>;
}

export function useRouter(): RouterCtx {
  return useContext(Ctx);
}

export function Link({ to, children, className, onNavigate }: { to: Target; children: ReactNode; className?: string; onNavigate?: () => void }) {
  const { navigate } = useRouter();
  const href = toHref(pathOf(to));
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate?.();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
