# Node 22 for the built-in node:sqlite module (same as app3-backend).
FROM node:22-alpine

WORKDIR /app

# Pull latest security patches for the OS-layer openssl libs.
RUN apk update && apk upgrade libssl3 libcrypto3

# Uses the lockfile if it exists (run the create-lockfile workflow once for
# apps/notes/backend to add it); falls back to npm install until then.
# Then remove the npm CLI itself: we only run `node server.js` at runtime,
# and npm's own bundled dependencies are what Trivy flags.
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY server.js ./

# Matches notes-backend's Deployment: runAsUser 101, containerPort 8080.
USER 101
EXPOSE 8080

CMD ["node", "server.js"]
