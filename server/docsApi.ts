// The docs API — ONE implementation, mounted twice.
//
// The Vite dev server mounts it as connect middleware; the production server
// mounts it on a node:http server. Both get identical behaviour, which is the
// point: "edit this page" must not be a dev-only trick that behaves differently
// (or not at all) in the deployment people actually read.
//
//   GET  /api/corpus        the parsed corpus + whether this server can write
//   GET  /api/doc?file=...  one document's raw markdown
//   POST /api/doc           { file, source } -> writes it, or refuses
//
// Zero dependencies beyond node builtins and the repo's own loader, so the
// production image needs nothing but node.
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadDocs, formatFailures, type LoadedDoc } from '../packages/content/src/docload.ts';

export interface DocsApiOptions {
  docsDir: string;
  /** Reject a document that only raises warnings. Matches the build's bar. */
  strict?: boolean;
  /** False makes the API read-only: the app then hides "Edit this page". */
  writable?: boolean;
}

/** Where a write is allowed to land: inside docsDir, a .md file, no traversal. */
export function safeDocPath(docsDir: string, repoRel: unknown): string | null {
  if (typeof repoRel !== 'string' || !repoRel.endsWith('.md')) return null;
  // `LoadedDoc.file` is repo-relative ('docs/bible/opcodes/mal.md') while docsDir
  // is the absolute 'docs', so resolve from docsDir's PARENT — then require the
  // result to still be inside docsDir. That rejects '..' and absolute paths
  // without having to pattern-match them.
  const abs = path.resolve(path.dirname(docsDir), repoRel);
  const inside = path.relative(docsDir, abs);
  if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return abs;
}

const lean = (d: LoadedDoc): Omit<LoadedDoc, 'source'> => {
  const { source: _source, ...rest } = d;
  return rest;
};

export function createDocsApi(opts: DocsApiOptions) {
  const { docsDir, strict = true, writable = true } = opts;

  // Parsing 71 documents is not free, and the corpus only changes when this
  // process writes it — so parse once and drop the cache on a successful save.
  let cache: { editable: boolean; LESSON_DOCS: unknown[]; OPCODE_DOCS: unknown[]; CONCEPT_DOCS: unknown[] } | null = null;

  function corpus() {
    if (cache) return cache;
    const { docs } = loadDocs(docsDir, { strict: false });
    cache = {
      editable: writable,
      LESSON_DOCS: docs.filter((d) => d.kind === 'lesson').map(lean),
      OPCODE_DOCS: docs.filter((d) => d.kind === 'opcode').map(lean),
      CONCEPT_DOCS: docs.filter((d) => d.kind === 'concept').map(lean),
    };
    return cache;
  }

  /** Drop the parse cache — call after anything writes into docsDir. */
  function invalidate() {
    cache = null;
  }

  function save(file: unknown, source: unknown): { code: number; body: object } {
    if (!writable) return { code: 403, body: { ok: false, error: 'this server is read-only' } };
    if (typeof source !== 'string') return { code: 400, body: { ok: false, error: 'source must be a string' } };
    const abs = safeDocPath(docsDir, file);
    if (!abs) return { code: 400, body: { ok: false, error: `refusing to write outside docs/: ${String(file)}` } };
    if (!existsSync(abs)) return { code: 404, body: { ok: false, error: `no such document: ${String(file)}` } };

    const before = readFileSync(abs, 'utf8');
    try {
      writeFileSync(abs, source, 'utf8');
      // Load the WHOLE corpus, not just this document: renaming a concept slug
      // turns {that-token} into an unknown token in every other page, and only a
      // corpus-wide load can see that. On failure the previous bytes go back, so
      // a rejected save can never leave docs/ broken.
      const { failures } = loadDocs(docsDir, { strict });
      if (failures.length) {
        writeFileSync(abs, before, 'utf8');
        return { code: 422, body: { ok: false, error: formatFailures(failures) } };
      }
    } catch (e) {
      try { writeFileSync(abs, before, 'utf8'); } catch { /* best effort */ }
      return { code: 500, body: { ok: false, error: e instanceof Error ? e.message : String(e) } };
    }
    invalidate();
    return { code: 200, body: { ok: true, file } };
  }

  /** Handle a docs-API request. Returns false if the url is not ours. */
  function handle(req: IncomingMessage, res: ServerResponse): boolean {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (code: number, body: unknown) => {
      res.statusCode = code;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/api/corpus' && req.method === 'GET') {
      send(200, corpus());
      return true;
    }

    if (url.pathname === '/api/doc' && req.method === 'GET') {
      const abs = safeDocPath(docsDir, url.searchParams.get('file'));
      if (!abs || !existsSync(abs)) return send(404, { ok: false, error: 'no such document' }), true;
      send(200, { ok: true, source: readFileSync(abs, 'utf8') });
      return true;
    }

    if (url.pathname === '/api/doc' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        let file: unknown;
        let source: unknown;
        try {
          ({ file, source } = JSON.parse(raw) as { file: unknown; source: unknown });
        } catch {
          return send(400, { ok: false, error: 'body must be JSON' });
        }
        const r = save(file, source);
        send(r.code, r.body);
      });
      return true;
    }

    return false;
  }

  return { handle, invalidate, corpus };
}
