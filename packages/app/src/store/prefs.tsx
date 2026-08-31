// App preferences + learner progress, backed by the shell's pure reducer and persisted to
// localStorage (theme, reduced-motion, completed lessons). Route stays with the router (the URL
// is its source of truth); this store owns everything else. hydrate() is migration-safe.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { reduce, persist, hydrate, defaultAppState, type AppState, type Theme } from '@tierra26/ui/shell.ts';

const KEY = 't26-state';

function loadInitial(): AppState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (raw) return hydrate(JSON.parse(raw));
  } catch { /* fall through */ }
  return defaultAppState();
}

function useSystemDark(): boolean {
  const [d, setD] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setD(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return d;
}

interface PrefsCtx {
  theme: Theme;
  dark: boolean;
  reducedMotion: boolean;
  completed: ReadonlySet<string>;
  setTheme(t: Theme): void;
  setReducedMotion(b: boolean): void;
  completeLesson(lessonId: string, goalId?: string): void;
  isCompleted(lessonId: string): boolean;
}

const Ctx = createContext<PrefsCtx>(null as unknown as PrefsCtx);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined as unknown as AppState, loadInitial);
  const sysDark = useSystemDark();
  const dark = state.theme === 'dark' || (state.theme === 'system' && sysDark);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(persist(state))); } catch { /* private mode */ } }, [state]);
  useEffect(() => {
    const el = document.documentElement;
    if (state.theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', state.theme);
    el.toggleAttribute('data-reduced-motion', state.reducedMotion);
  }, [state.theme, state.reducedMotion]);

  const setTheme = useCallback((t: Theme) => dispatch({ type: 'setTheme', theme: t }), []);
  const setReducedMotion = useCallback((b: boolean) => dispatch({ type: 'setReducedMotion', reducedMotion: b }), []);
  const completeLesson = useCallback((lessonId: string, goalId?: string) => {
    const goals = goalId ? [goalId] : [];
    dispatch({ type: 'completeLesson', lessonId, requiredGoals: goals, metGoals: goals });
  }, []);
  const isCompleted = useCallback((id: string) => state.learner.completed.has(id), [state.learner.completed]);

  const value = useMemo<PrefsCtx>(() => ({
    theme: state.theme, dark, reducedMotion: state.reducedMotion, completed: state.learner.completed,
    setTheme, setReducedMotion, completeLesson, isCompleted,
  }), [state, dark, setTheme, setReducedMotion, completeLesson, isCompleted]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsCtx {
  return useContext(Ctx);
}
