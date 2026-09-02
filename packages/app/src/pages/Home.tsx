// The lobby: the pitch + the brick-by-brick chapter map (with progress) + doors to sandbox/versus/wiki.
import { CHAPTERS } from '../learn/lessons.ts';
import { Link } from '../router/router.tsx';
import { usePrefs } from '../store/prefs.tsx';
import { WipMark } from '../learn/WipMark.tsx';

export function Home() {
  const { isCompleted, completed } = usePrefs();
  const available = (i: number) => i === 0 || isCompleted(CHAPTERS[i - 1]!.id); // linear gate over the chapter order
  const nextIdx = CHAPTERS.findIndex((c, i) => available(i) && !isCompleted(c.id));
  const next = CHAPTERS[nextIdx >= 0 ? nextIdx : 0];

  return (
    <div className="page home">
      <section className="hero">
        <h1>Grow a creature.</h1>
        <p className="hero-lede">
          Meet a tiny living program, learn to read it one block at a time, then teach it to copy
          itself and evolve. Everything you write is real machine code.
        </p>
        <div className="hero-cta">
          {next && (
            <Link className="btn primary" to={{ surface: 'learn', chapterId: next.id }}>
              {completed.size > 0 ? 'Continue learning' : 'Start learning'}
            </Link>
          )}
          <Link className="btn" to={{ surface: 'sandbox' }}>Free play</Link>
          <Link className="btn" to={{ surface: 'versus' }}>Versus</Link>
          <Link className="btn" to={{ surface: 'bible' }}>The Bible</Link>
        </div>
      </section>

      <section className="lessons">
        <h2>The path</h2>
        <div className="lesson-list">
          {CHAPTERS.map((c, i) => {
            const done = isCompleted(c.id);
            const locked = !available(i) && !done;
            return (
              <Link
                key={c.id}
                className={`lesson-card${done ? ' done' : ''}${locked ? ' locked' : ''}${!c.ready ? ' soon' : ''}`}
                to={{ surface: 'learn', chapterId: c.id }}
              >
                <span className="lc-ch">
                  Chapter {c.no}
                  {locked && <span className="lc-lock" aria-label="locked">🔒</span>}
                  {done && <span className="lc-check">✓</span>}
                  {!c.ready && !locked && <span className="lc-soon">soon</span>}
                </span>
                <span className="lc-title">{!c.ready && <WipMark />}{c.title}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
