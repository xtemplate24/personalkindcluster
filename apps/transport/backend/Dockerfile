# Single stage is enough here — there's no build step, just install + copy.
FROM node:20-alpine

WORKDIR /app

# Pull latest security patches for the OS-layer openssl libs (same pattern
# as apps/landing's libexpat fix).
RUN apk update && apk upgrade libssl3 libcrypto3

# Uses the lockfile if it exists (run the create-lockfile workflow once for
# apps/transport/backend to add it); falls back to npm install until then.
COPY package*.json ./
# Install our deps, then remove the npm CLI itself. We only ever run
# `node server.js` at runtime — npm's own vendored dependency tree
# (tar, glob, minimatch, pacote, sigstore, etc., bundled inside every
# node:*-alpine image) is what Trivy was flagging, not anything in our
# package.json.
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY server.js ./
COPY lib ./lib

# Matches transport-backend's Deployment: runAsUser 101, containerPort 8080.
USER 101
EXPOSE 8080

CMD ["node", "server.js"]