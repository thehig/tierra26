// The lobby: the pitch + the authored lessons + doors to sandbox and the wiki.
import { LESSONS } from '@tierra26/content/lessons.ts';
import { CURRICULUM } from '@tierra26/content/progress.ts';
import { Link } from '../router/router.tsx';

export function Home() {
  return (
    <div className="page home">
      <section className="hero">
        <h1>Grow a creature.</h1>
        <p className="hero-lede">
          Write a tiny program, drop it in the soup, and watch it copy itself, fill the tank,
          and — chapters later — mutate and evolve. Everything you write is real machine code.
        </p>
        <div className="hero-cta">
          {LESSONS[0] && <Link className="btn primary" to={{ surface: 'lesson', lessonId: LESSONS[0].id }}>Start learning</Link>}
          <Link className="btn" to={{ surface: 'sandbox' }}>Free play</Link>
          <Link className="btn" to={{ surface: 'wiki' }}>Instructions</Link>
        </div>
      </section>

      <section className="lessons">
        <h2>Lessons</h2>
        <div className="lesson-list">
          {LESSONS.map((l) => {
            const m = CURRICULUM.lessons[l.id];
            return (
              <Link key={l.id} className="lesson-card" to={{ surface: 'lesson', lessonId: l.id }}>
                <span className="lc-ch">Chapter {m?.chapter}</span>
                <span className="lc-title">{m?.title ?? l.id}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
