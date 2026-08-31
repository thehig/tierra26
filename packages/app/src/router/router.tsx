// A tiny history router over the shell's Route type. `null` route === the home lobby.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { pathToRoute, routeToPath, type Route } from '@tierra26/ui/shell.ts';

type Target = Route | 'home';

interface RouterCtx {
  route: Route | null;
  navigate: (to: Target) => void;
}

const Ctx = createContext<RouterCtx>({ route: null, navigate: () => {} });

function pathOf(to: Target): string {
  return to === 'home' ? '/' : routeToPath(to);
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
  return <Ctx.Provider value={{ route: pathToRoute(path), navigate }}>{children}</Ctx.Provider>;
}

export function useRouter(): RouterCtx {
  return useContext(Ctx);
}

export function Link({ to, children, className }: { to: Target; children: ReactNode; className?: string }) {
  const { navigate } = useRouter();
  const href = pathOf(to);
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
