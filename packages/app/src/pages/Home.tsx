// The lobby: the pitch + the authored lessons (with progress) + doors to sandbox/versus/wiki.
import { LESSONS } from '@tierra26/content/lessons.ts';
import { CURRICULUM } from '@tierra26/content/progress.ts';
import { Link } from '../router/router.tsx';
import { usePrefs } from '../store/prefs.tsx';

export function Home() {
  const { isCompleted } = usePrefs();
  // The next uncompleted authored lesson — the one to nudge toward.
  const nextIdx = LESSONS.findIndex((l) => !isCompleted(l.id));

  return (
    <div className="page home">
      <section className="hero">
        <h1>Grow a creature.</h1>
        <p className="hero-lede">
          Write a tiny program, drop it in the soup, and watch it copy itself, fill the tank,
          and — chapters later — mutate and evolve. Everything you write is real machine code.
        </p>
        <div className="hero-cta">
          {LESSONS[Math.max(0, nextIdx)] && (
            <Link className="btn primary" to={{ surface: 'lesson', lessonId: LESSONS[Math.max(0, nextIdx)]!.id }}>
              {nextIdx > 0 ? 'Continue learning' : 'Start learning'}
            </Link>
          )}
          <Link className="btn" to={{ surface: 'sandbox' }}>Free play</Link>
          <Link className="btn" to={{ surface: 'versus' }}>Versus</Link>
          <Link className="btn" to={{ surface: 'wiki' }}>Instructions</Link>
        </div>
      </section>

      <section className="lessons">
        <h2>Lessons</h2>
        <div className="lesson-list">
          {LESSONS.map((l, i) => {
            const m = CURRICULUM.lessons[l.id];
            const done = isCompleted(l.id);
            const locked = i > 0 && !isCompleted(LESSONS[i - 1]!.id) && !done;
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
