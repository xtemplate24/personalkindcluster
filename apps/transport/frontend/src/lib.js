// Shared helpers: localStorage, API calls, time formatting, line colours.
import { useEffect, useRef, useState } from "react";

export const MAX_SAVED = 10;

// ---------------------------------------------------------------------------
// localStorage — this is a public app, so everything a visitor saves lives
// only in their own browser. Nothing is stored on the server.
// Reads/writes are wrapped in try/catch because storage can be blocked
// (private mode, strict browser settings) and the app should still work.
// ---------------------------------------------------------------------------
const PREFIX = "transport.";

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — keep working in memory */
  }
}

// useState that also persists to localStorage.
export function useStored(key, fallback) {
  const [value, setValue] = useState(() => load(key, fallback));
  useEffect(() => save(key, value), [key, value]);
  return [value, setValue];
}

// ---------------------------------------------------------------------------
// API — all calls go to our own frontend server, which forwards to the
// backend inside the cluster. The browser never talks to LTA/SMRT directly.
// ---------------------------------------------------------------------------
// Difference between the server's clock and this device's clock. Bus ETAs
// are absolute timestamps, so a phone whose clock is a minute off would show
// the wrong countdown; we correct for that using the server's time.
let clockOffset = 0;
export const serverNow = () => Date.now() + clockOffset;

// Several parts of the page can ask for the same thing at once (a stop card
// and the target toast both watch the same stop), so share results for a
// few seconds instead of fetching twice.
const recent = new Map(); // path -> { at, promise }
const SHARE_MS = 5000;

export function api(path) {
  const hit = recent.get(path);
  if (hit && Date.now() - hit.at < SHARE_MS) return hit.promise;
  const promise = fetchApi(path);
  recent.set(path, { at: Date.now(), promise });
  promise.catch(() => recent.delete(path)); // don't keep failures around
  return promise;
}

async function fetchApi(path) {
  const res = await fetch(`/api/${path}`);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  if (data?.serverTime) {
    const t = Date.parse(data.serverTime);
    if (!Number.isNaN(t)) clockOffset = t - Date.now();
  }
  return data;
}

// Calls `fn` now and then every `ms` while the tab is visible. Pauses when the
// tab is hidden (saves the visitor's battery and our upstream quota).
export function usePolling(fn, ms, deps = []) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    let timer = null;
    const tick = () => {
      if (document.visibilityState === "visible") saved.current();
    };
    tick();
    timer = setInterval(tick, ms);
    const onVis = () => document.visibilityState === "visible" && saved.current();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}

// Re-renders every `ms` (for live countdowns).
export function useNow(ms = 1000) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------
// Minutes until an ISO timestamp. LTA convention: under a minute = "Arr".
export function minutesUntil(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now) / 60000);
}

export function etaLabel(min) {
  if (min === null || min === undefined) return "–";
  if (min <= 0) return "Arr";
  return `${min} min`;
}

// "4:07" style countdown for the toast.
export function countdown(ms) {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Clock time in Singapore, e.g. "3:59 pm". Always Singapore time, even if the
// phone is set to another time zone (handy when travelling).
const SG_TIME = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  hour: "numeric",
  minute: "2-digit",
});
export const clockTime = (ms) => (Number.isFinite(ms) ? SG_TIME.format(new Date(ms)) : null);

// ---------------------------------------------------------------------------
// MRT line colours (official LTA palette)
// ---------------------------------------------------------------------------
const LINE_COLOURS = {
  NS: "#d42e12", // North-South
  EW: "#009645", // East-West
  CG: "#009645", // Changi Airport branch
  CC: "#fa9e0d", // Circle
  CE: "#fa9e0d", // Circle extension
  NE: "#9900aa", // North East
  DT: "#005ec4", // Downtown
  TE: "#9d5b25", // Thomson-East Coast
  BP: "#748477", // Bukit Panjang LRT
  SW: "#748477",
  SE: "#748477",
  PW: "#748477",
  PE: "#748477",
  ST: "#748477",
  PT: "#748477",
};

export const lineColour = (code) => LINE_COLOURS[String(code).slice(0, 2).toUpperCase()] || "#8ea3a7";

// ---------------------------------------------------------------------------
// Google Maps links (no API key needed)
// ---------------------------------------------------------------------------
export const gmapsDirections = (lat, lng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;

export const gmapsSearch = (query) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
