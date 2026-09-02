// Boot: get the corpus, THEN load the app.
//
// The order is load-bearing. `doc/docs.ts` and `learn/lessons.ts` build their
// indexes at module scope, so they must not be evaluated until the corpus is in
// place — which is exactly what the dynamic `import('./App.tsx')` below
// guarantees, because ESM evaluates a module the first time it is imported.
// Static-importing App here would run those modules before the fetch resolved.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './design/tokens.css';
import './styles.css';
import { loadCorpus, setCorpus } from './doc/corpus.ts';

async function boot() {
  setCorpus(await loadCorpus());
  const { default: App } = await import('./App.tsx');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
