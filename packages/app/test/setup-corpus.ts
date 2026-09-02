// Seed the runtime corpus for tests and stories.
//
// The app fetches `/api/corpus` at boot and only falls back to the compiled-in
// copy when there is no server. Tests and stories have neither: they import
// `doc/docs.ts` and `learn/lessons.ts` directly, and those build their indexes
// at module scope, so without this they would hit `getCorpus()`'s deliberate
// "read before it was loaded" throw.
//
// Seeding from `virtual:tierra-content` is the honest fixture: it is the real
// corpus, parsed by the real loader at build time, so a test still exercises the
// documents on disk rather than a hand-made stand-in.
import { CONCEPT_DOCS, LESSON_DOCS, OPCODE_DOCS } from 'virtual:tierra-content';
import { setCorpus } from '../src/doc/corpus.ts';

setCorpus({
  // Tests are not talking to a server, so nothing is editable — which also keeps
  // "Edit this page" out of every story that renders a page.
  editable: false,
  LESSON_DOCS,
  OPCODE_DOCS,
  CONCEPT_DOCS,
});
