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
  return typeof location !== 'undefined' ? location.pathname + location.search : '/';
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
    history.pushState({}, '', p);
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
  const href = pathOf(to);
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
