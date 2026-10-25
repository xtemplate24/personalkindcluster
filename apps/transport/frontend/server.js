import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable("x-powered-by");

const PORT = process.env.PORT || 8080;
// Set via transport-frontend's Deployment env — points at the backend's
// ClusterIP service. Never exposed to the browser directly.
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8081";
// CARTO basemap key (from the transport-carto Secret). It ends up in the
// visitor's browser anyway (it's part of every map tile URL), so protect it
// by restricting it to transport.xtemplate.cc in CARTO's key settings.
const CARTO_KEY = process.env.CARTO_BASEMAP_KEY || "";

// Basic browser hardening. The CSP lists exactly what the page loads:
// our own files, Google Fonts, and the map tiles (CARTO). Location access is
// only allowed for this site itself.
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data: https://*.basemaps.cartocdn.com https://basemaps.cartocdn.com https://tile.openstreetmap.org",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join("; "),
  });
  next();
});

// Built React app (hashed asset names, so they can be cached for a long time).
app.use(
  express.static(path.join(__dirname, "dist"), {
    index: false,
    setHeaders: (res, file) => {
      if (file.includes(`${path.sep}assets${path.sep}`)) {
        res.set("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

// Used by the Deployment's readiness/liveness probes (path: "/").
app.get("/", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// Runtime settings for the page, so the key isn't baked into the image.
app.get("/config.json", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.json({ cartoKey: CARTO_KEY || null });
});

// Forward every GET /api/... to the backend, query string included.
// The visitor's IP is passed along so the backend can rate-limit per person.
app.get("/api/*", async (req, res) => {
  try {
    const upstream = await fetch(`${BACKEND_URL}${req.originalUrl}`, {
      headers: {
        accept: "application/json",
        "x-forwarded-for": req.get("x-forwarded-for") || req.socket.remoteAddress || "",
        ...(req.get("cf-connecting-ip") ? { "cf-connecting-ip": req.get("cf-connecting-ip") } : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.set("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.set("Cache-Control", "no-store");
    const retry = upstream.headers.get("retry-after");
    if (retry) res.set("Retry-After", retry);
    res.send(body);
  } catch (err) {
    console.error(err.message);
    res.status(502).json({ error: "backend unreachable" });
  }
});

app.listen(PORT, () => {
  console.log(`transport-frontend listening on ${PORT}, proxying to ${BACKEND_URL}`);
});
