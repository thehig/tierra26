// The global language mode: `simple` shows the friendly GeneScript (grow-a, the kid text); `advanced`
// shows the real instruction code (the mnemonic, incA). One context drives every surface — the genome
// viewer, the datasheet, tooltips, and the code editor — so a flip is consistent everywhere.
import { createContext, useContext, useState, type ReactNode } from 'react';

export type LanguageMode = 'simple' | 'advanced';

interface LangCtx { mode: LanguageMode; toggle: () => void; }
const Ctx = createContext<LangCtx>({ mode: 'simple', toggle: () => {} });

export function useLanguageMode(): LanguageMode { return useContext(Ctx).mode; }
export function useLanguageToggle(): () => void { return useContext(Ctx).toggle; }

const KEY = 'tierra26.lang';
function stored(): LanguageMode {
  try { return localStorage.getItem(KEY) === 'advanced' ? 'advanced' : 'simple'; } catch { return 'simple'; }
}

// The app provider: holds the mode, persists it, and exposes a toggle for the topbar control.
export function LanguageModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<LanguageMode>(stored);
  const toggle = () => setMode((m) => {
    const next: LanguageMode = m === 'simple' ? 'advanced' : 'simple';
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
    return next;
  });
  return <Ctx.Provider value={{ mode, toggle }}>{children}</Ctx.Provider>;
}

// A fixed provider (no toggle) — for Storybook's toolbar global and tests.
export function LanguageModeFixed({ mode, children }: { mode: LanguageMode; children: ReactNode }) {
  return <Ctx.Provider value={{ mode, toggle: () => {} }}>{children}</Ctx.Provider>;
}
