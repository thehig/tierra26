# --- build stage: compile the Vite app from the workspace source ---
FROM node:22-alpine AS build
WORKDIR /app

# Manifests + lockfile first (better layer caching), then the workspace sources.
COPY package.json package-lock.json ./
COPY packages ./packages
# The authored content the build compiles in (see the tierra:content Vite plugin).
COPY docs ./docs

RUN npm ci
RUN npm run build --workspace @tierra26/app

# --- serve stage: static nginx on port 80 (compose maps it to 8026) ---
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/app/dist /usr/share/nginx/html
EXPOSE 80
