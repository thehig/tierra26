# --- build stage: compile the Vite app from the workspace source ---
FROM node:22-alpine AS build
WORKDIR /app

# Manifests + lockfile first (better layer caching), then the workspace sources.
COPY package.json package-lock.json ./
COPY packages ./packages
# The authored content the build compiles in (see the tierra:content Vite plugin).
# Still needed at build time: the compiled-in corpus is the fallback the app uses
# if it is ever served without the API.
COPY docs ./docs

RUN npm ci
RUN npm run build --workspace @tierra26/app

# --- serve stage: node, because the docs are editable --------------------------
# This used to be `nginx:alpine` over a static dist/, and it cannot be any more.
# docs/ is the source of truth and "Edit this page" writes it, so the server has
# to be able to read the corpus at request time and write a document back. A
# static file server has nothing to write with, and a bundle compiled at build
# time would keep serving the pre-edit copy.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV TIERRA_PORT=80

# Only what the server needs: its own source, the loader/parser it imports, and
# the built assets. No node_modules — server/ and packages/content use node
# builtins and repo-relative imports, run through node 22's type stripping.
COPY server ./server
COPY packages/content ./packages/content
COPY packages/engine ./packages/engine
COPY packages/genescript ./packages/genescript
COPY --from=build /app/packages/app/dist ./packages/app/dist

# Seed docs/ into the image so a container with no volume still serves the
# corpus. Mount a volume over it (see docker-compose.yml) to keep edits.
COPY docs ./docs

EXPOSE 80
# Set TIERRA_READONLY=1 to serve the corpus but refuse writes.
CMD ["node", "--experimental-strip-types", "server/index.ts"]
