// Small helpers shared by the bus and MRT modules.

// ---------- tiny in-memory cache ----------
// Keeps upstream calls low: many visitors looking at the same bus stop within
// a few seconds share one upstream request. If two requests arrive while the
// first is still in flight, the second waits for the same promise instead of
// firing another call ("request coalescing").
const store = new Map(); // key -> { value, expires, pending }

export async function cached(key, ttlMs, loader) {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.value !== undefined && hit.expires > now) return hit.value;
  if (hit && hit.pending) return hit.pending;

  const pending = (async () => {
    try {
      const value = await loader();
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    } catch (err) {
      // Serve the last good value if we have one (stale beats nothing),
      // otherwise surface the error.
      if (hit && hit.value !== undefined) {
        store.set(key, { value: hit.value, expires: Date.now() + Math.min(ttlMs, 30_000) });
        return hit.value;
      }
      store.delete(key);
      throw err;
    }
  })();

  store.set(key, { ...(hit || {}), pending });
  return pending;
}

// Drop expired entries now and then so memory can't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) if (!v.pending && v.expires < now) store.delete(k);
}, 60_000).unref();

// ---------- fetch with a timeout ----------
export class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function getJson(url, headers = {}, timeoutMs = 8000) {
  let res;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(`upstream unreachable (${new URL(url).host})`);
  }
  if (!res.ok) throw new UpstreamError(`upstream ${new URL(url).host} returned ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new UpstreamError(`upstream ${new URL(url).host} sent invalid JSON`);
  }
}

// ---------- distance between two lat/lng points, in metres ----------
export function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// ---------- per-IP rate limit ----------
// This is a public app, so cap how fast one visitor can hit us (and, through
// us, the upstream APIs). Fixed one-minute window, counted per client IP.
export function rateLimit({ perMinute }) {
  const hits = new Map(); // ip -> { count, windowStart }
  setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [ip, v] of hits) if (v.windowStart < cutoff) hits.delete(ip);
  }, 60_000).unref();

  return (req, res, next) => {
    const ip = clientIp(req);
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || now - entry.windowStart > 60_000) {
      hits.set(ip, { count: 1, windowStart: now });
      return next();
    }
    entry.count += 1;
    if (entry.count > perMinute) {
      res.set("Retry-After", "30");
      return res.status(429).json({ error: "Too many requests — slow down a little." });
    }
    next();
  };
}

// The real visitor IP: Cloudflare sets CF-Connecting-IP, and the frontend
// pod forwards it (plus X-Forwarded-For) when it proxies to us.
export function clientIp(req) {
  const cf = req.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
