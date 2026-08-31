import { LESSONS } from '@tierra26/content/lessons.ts';
import { CURRICULUM } from '@tierra26/content/progress.ts';
import { LessonReader } from '../reader/LessonReader.tsx';
import { Link } from '../router/router.tsx';

export function LessonPage({ lessonId, dark }: { lessonId: string; dark: boolean }) {
  const lesson = LESSONS.find((l) => l.id === lessonId);
  const meta = CURRICULUM.lessons[lessonId];
  if (!lesson) {
    return (
      <div className="page">
        <h1>Lesson not found</h1>
        <p>This lesson hasn't been written yet.</p>
        <Link className="btn" to="home">← Back to lessons</Link>
      </div>
    );
  }
  const idx = LESSONS.findIndex((l) => l.id === lessonId);
  const next = LESSONS[idx + 1];

  return (
    <div className="page reader-page">
      <div className="crumb"><Link to="home">Lessons</Link> <span>/</span> {meta?.title ?? lessonId}</div>
      <LessonReader source={lesson.source} dark={dark} />
      <div className="reader-nav">
        {next
          ? <Link className="btn primary" to={{ surface: 'lesson', lessonId: next.id }}>Next: {CURRICULUM.lessons[next.id]?.title} →</Link>
          : <Link className="btn" to="home">Back to lessons</Link>}
      </div>
    </div>
  );
}
