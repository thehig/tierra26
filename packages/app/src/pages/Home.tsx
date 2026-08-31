// The lobby: the pitch + the authored lessons (with progress) + doors to sandbox/versus/wiki.
import { useMemo } from 'react';
import { LESSONS } from '@tierra26/content/lessons.ts';
import { CURRICULUM, computeUnlocked } from '@tierra26/content/progress.ts';
import { Link } from '../router/router.tsx';
import { usePrefs } from '../store/prefs.tsx';

export function Home() {
  const { isCompleted, completed } = usePrefs();
  // Availability is the real prerequisite DAG: a lesson unlocks once its requires-closure
  // is complete (computeUnlocked.available). The frontier is the first available, undone lesson.
  const available = useMemo(() => computeUnlocked(CURRICULUM, { completed }).available, [completed]);
  const next = LESSONS.find((l) => available.has(l.id) && !isCompleted(l.id));

  return (
    <div className="page home">
      <section className="hero">
        <h1>Grow a creature.</h1>
        <p className="hero-lede">
          Write a tiny program, drop it in the soup, and watch it copy itself, fill the tank,
          and — chapters later — mutate and evolve. Everything you write is real machine code.
        </p>
        <div className="hero-cta">
          {completed.size === 0
            ? <Link className="btn primary" to={{ surface: 'meet' }}>Start learning</Link>
            : next && <Link className="btn primary" to={{ surface: 'lesson', lessonId: next.id }}>Continue learning</Link>}
          <Link className="btn" to={{ surface: 'sandbox' }}>Free play</Link>
          <Link className="btn" to={{ surface: 'versus' }}>Versus</Link>
          <Link className="btn" to={{ surface: 'wiki' }}>Instructions</Link>
        </div>
      </section>

      <section className="lessons">
        <h2>Lessons</h2>
        <div className="lesson-list">
          <Link className="lesson-card intro" to={{ surface: 'meet' }}>
            <span className="lc-ch">Chapter 0 · start here</span>
            <span className="lc-title">Meet a creature</span>
          </Link>
          {LESSONS.map((l) => {
            const m = CURRICULUM.lessons[l.id];
            const done = isCompleted(l.id);
            const locked = !available.has(l.id) && !done; // prereqs not yet complete (a done lesson is never locked)
            return (
              <Link key={l.id} className={`lesson-card${done ? ' done' : ''}${locked ? ' locked' : ''}`} to={{ surface: 'lesson', lessonId: l.id }}>
                <span className="lc-ch">Chapter {m?.chapter} {locked && <span className="lc-lock" aria-label="not yet unlocked">🔒</span>}{done && <span className="lc-check">✓</span>}</span>
                <span className="lc-title">{m?.title ?? l.id}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
