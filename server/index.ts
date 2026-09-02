// The production server.
//
// It replaces nginx, and the reason is the editor: docs/ is the source of truth,
// "Edit this page" writes docs/, and a static file server has nothing to write
// with. This serves the built bundle AND the docs API from one node process, so
// the deployment people read is the deployment they can edit.
//
// Node builtins only — no express, no deps. The image is `node:22-alpine` plus
// the repo, and `docs/` is a volume so an edit outlives the container.
//
//   TIERRA_PORT      default 80
//   TIERRA_DOCS      default <repo>/docs
//   TIERRA_DIST      default <repo>/packages/app/dist
//   TIERRA_READONLY  set to 1 to serve the corpus but refuse writes
import http from 'node:http';
import path from 'node:path';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDocsApi } from './docsApi.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env['TIERRA_PORT'] ?? 80);
const DOCS = process.env['TIERRA_DOCS'] ?? path.join(ROOT, 'docs');
const DIST = process.env['TIERRA_DIST'] ?? path.join(ROOT, 'packages/app/dist');
const READONLY = process.env['TIERRA_READONLY'] === '1';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// Not strict: the API must be able to SERVE a document that fails validation, or
// a corpus with one bad page becomes uneditable — exactly when you need the
// editor. Saving is still gated (see docsApi.save).
const api = createDocsApi({ docsDir: DOCS, strict: true, writable: !READONLY });

/** Resolve a url path inside DIST, or null if it escapes. */
function distPath(urlPath: string): string | null {
  const abs = path.resolve(DIST, '.' + decodeURIComponent(urlPath));
  const inside = path.relative(DIST, abs);
  if (inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return abs;
}

const server = http.createServer((req, res) => {
  if (api.handle(req, res)) return;

  const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
  let file = distPath(urlPath);

  if (file && existsSync(file) && statSync(file).isFile()) {
    // Hashed assets are immutable; index.html must never be cached or a
    // deployment would keep serving the previous bundle.
    res.setHeader(
      'cache-control',
      urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
    res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(res);
    return;
  }

  // SPA history fallback: /bible/mal, /concept/soup, /learn/loops are client routes.
  file = path.join(DIST, 'index.html');
  if (!existsSync(file)) {
    res.statusCode = 500;
    res.end('no build found — run `npm run build`');
    return;
  }
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('content-type', MIME['.html']!);
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`tierra26 on :${PORT}  docs=${DOCS}  dist=${DIST}  ${READONLY ? '(read-only)' : '(editable)'}`);
});
