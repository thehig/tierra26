// "Meet a creature" — the anatomy-first onboarding. A scroll-driven walkthrough of ONE simple
// creature's parts (genome blocks, reading head, notebooks, flags, age), ending with a
// step-one-tick-at-a-time demo. Built as a bespoke experience (the content DSL is linear prose).
import { LESSONS } from '@tierra26/content/lessons.ts';
import { CURRICULUM } from '@tierra26/content/progress.ts';
import { Scrolly, type ScrollyStep } from '../anatomy/Scrolly.tsx';
import { EntityDiagram, type Focus } from '../anatomy/EntityDiagram.tsx';
import { useMicroEngine } from '../anatomy/useMicroEngine.ts';
import { Link } from '../router/router.tsx';

// A tiny, label-free creature: every step visibly changes a notebook (no confusing template nops).
const MEET_GENOME = 'grow-a\ngrow-b\nflip-bit\ngrow-a\ngrow-c';

const FOCI: Focus[] = ['whole', 'genome', 'ip', 'registers', 'flags', 'age', 'run'];

const STEPS: ScrollyStep[] = [
  { id: 'meet', content: (<><h2>This is a creature.</h2><p>Everything alive in the soup is a tiny program, just like this one. Let's take it apart and see how it works — one piece at a time.</p></>) },
  { id: 'genome', content: (<><h2>Its genome</h2><p>A creature is a <strong>stack of instruction blocks</strong> — its genome. Each block is one small thing the creature can do. Read them top to bottom, like a to-do list.</p></>) },
  { id: 'ip', content: (<><h2>The reading head</h2><p>The little <strong>▶ reading head</strong> shows which block the creature is about to run. Every tick it does that one block, then the head slides to the next.</p></>) },
  { id: 'registers', content: (<><h2>Four notebooks</h2><p>A creature keeps numbers in <strong>four little notebooks</strong> — A, B, C and D. It uses them to count, to remember where it is, and to do sums. Watch them change as it runs.</p></>) },
  { id: 'flags', content: (<><h2>Flags</h2><p>Flags are tiny <strong>yes/no lights</strong> the creature flips as it works — like "did that go wrong?" They help it make decisions later on.</p></>) },
  { id: 'age', content: (<><h2>Age &amp; size</h2><p>Every creature has an <strong>age</strong> (how many ticks it's lived) and a <strong>size</strong> (how many blocks make up its body). The oldest, most crowded-out creatures are the first to go.</p></>) },
  { id: 'run', content: (<><h2>Watch it run</h2><p>Now press <strong>Step one tick</strong> over and over. Watch the reading head move down and a notebook change with each block. That's a creature <em>thinking</em>, one instruction at a time.</p><p className="run-hint">→ use the controls on the creature.</p></>) },
];

export function AnatomyPage() {
  const micro = useMicroEngine(MEET_GENOME);
  const firstLesson = LESSONS[0];

  return (
    <div className="page anatomy">
      <header className="anatomy-hero">
        <div className="eyebrow">Chapter 0 · Meet a creature</div>
        <h1>How to read a creature</h1>
        <p className="anatomy-lede">Before you build one, let's get to know one. Scroll down — we'll walk through every part of a living program, then run it one tick at a time.</p>
      </header>

      <Scrolly
        steps={STEPS}
        stage={(active) => (
          <EntityDiagram
            state={micro.state}
            focus={FOCI[active] ?? 'whole'}
            onStep={micro.step}
            onReset={micro.reset}
            steps={micro.steps}
          />
        )}
      />

      <div className="anatomy-next">
        <p>Now you know the parts. Ready to make one of your own?</p>
        {firstLesson && (
          <Link className="btn primary" to={{ surface: 'lesson', lessonId: firstLesson.id }}>
            Next: {CURRICULUM.lessons[firstLesson.id]?.title ?? 'your first lesson'} →
          </Link>
        )}
      </div>
    </div>
  );
}
