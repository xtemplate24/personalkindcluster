# Build stage — compiles the React app to static files
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# Uses the lockfile if it exists (run the create-lockfile workflow once for
# apps/transport/frontend to add it); falls back to npm install until then.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build

# Runtime stage — serves the built assets and proxies /api/* to the
# backend. (Unlike apps/landing, this can't drop to a plain nginx image:
# the app-deployments manifest expects a server that reads BACKEND_URL
# and forwards requests server-side, so Node stays in the final image.)
FROM node:20-alpine
WORKDIR /app

# Pull latest security patches for the OS-layer openssl libs (same pattern
# as apps/landing's libexpat fix).
RUN apk update && apk upgrade libssl3 libcrypto3

COPY package*.json ./
# npm ci installs exactly what's pinned in package-lock.json. Then remove
# the npm CLI itself — we only ever run `node server.js` at runtime, and
# npm's own vendored dependency tree (tar, glob, minimatch, pacote,
# sigstore, etc., bundled inside every node:*-alpine image) is what Trivy
# was flagging, not anything in our package.json.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY server.js ./
COPY --from=build /app/dist ./dist

# Matches transport-frontend's Deployment: runAsUser 101, containerPort 8080.
USER 101
EXPOSE 8080

CMD ["node", "server.js"]
