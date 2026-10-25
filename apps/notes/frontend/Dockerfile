# Build stage: compile React to static files
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# Uses the lockfile if it exists (run the create-lockfile workflow once for
# apps/notes/frontend to add it); falls back to npm install until then.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

# Serve stage: plain nginx, runs as UID 101 on port 8080 (same as app3).
# Uploads never pass through here: the ingress sends /api straight to the
# backend, so nginx's 1 MB body limit doesn't apply.
FROM nginxinc/nginx-unprivileged:stable-alpine
USER root
RUN apk update && apk upgrade libexpat
USER 101
COPY --chown=101:101 --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
