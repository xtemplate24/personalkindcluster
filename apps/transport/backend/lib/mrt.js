// MRT data: station list, live "next train" times, and service alerts.
//
// IMPORTANT: LTA does NOT publish live train arrival times. The only source
// is the feed behind SMRT's own "train arrival" web page. It's unofficial
// (no key, no SLA, could change without notice) and only covers SMRT-run
// lines: North-South, East-West, Circle, Thomson-East Coast and Bukit Panjang
// LRT. North East, Downtown, and Sengkang/Punggol LRT (SBS Transit) are not
// included. Everything below is written defensively for that reason.
//
// Service alerts (breakdowns, delays) DO come from LTA DataMall and need
// LTA_ACCOUNT_KEY.

import { cached, getJson, UpstreamError } from "./util.js";

const SMRT_STATIONS_URL =
  process.env.SMRT_STATIONS_URL || "https://connect.smrt.wwprojects.com/smrt/api/stations";
const SMRT_ARRIVAL_URL =
  process.env.SMRT_ARRIVAL_URL ||
  "https://connectv3.smrt.wwprojects.com/smrt/api/train_arrival_time_by_id";
// The SMRT feed expects the request to look like it came from their journey page.
const SMRT_HEADERS = { Referer: "http://journey.smrt.com.sg/journey/station_info/" };

const LTA_KEY = process.env.LTA_ACCOUNT_KEY || "";
const LTA_BASE = process.env.LTA_BASE_URL || "https://datamall2.mytransport.sg/ltaodataservice";

const DAY = 24 * 60 * 60 * 1000;

// "CC9,EW8" -> ["CC9", "EW8"]
const splitCodes = (code) =>
  String(code || "")
    .split(/[,/ ]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

// ---------------------------------------------------------------------------
// Station list: [{ name, codes: ["NS10"] }], cached for a day.
// ---------------------------------------------------------------------------
export function getStations() {
  return cached("mrt:stations", DAY, async () => {
    const allowedHost = new URL(SMRT_STATIONS_URL).host;
    const seen = new Map();
    let url = SMRT_STATIONS_URL;
    // The list is paginated with a "next" URL. Only follow it if it stays on
    // the same host (never let the upstream redirect us somewhere else).
    for (let page = 0; url && page < 30; page++) {
      const data = await getJson(url, SMRT_HEADERS, 10000);
      for (const r of Array.isArray(data?.results) ? data.results : []) {
        const name = String(r.name || "").trim();
        if (!name) continue;
        const prev = seen.get(name);
        const codes = new Set([...(prev?.codes || []), ...splitCodes(r.code)]);
        seen.set(name, { name, codes: [...codes] });
      }
      let next = null;
      try {
        if (data?.next) {
          const n = new URL(data.next, url);
          if (n.host === allowedHost) next = n.toString();
        }
      } catch {
        next = null;
      }
      url = next;
    }
    if (!seen.size) throw new UpstreamError("MRT station list came back empty");
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
}

// Only allow station names we know about (or, if the list is down, a
// conservative pattern) before passing them upstream.
export async function resolveStation(name) {
  const clean = String(name || "").trim();
  try {
    const stations = await getStations();
    return stations.find((s) => s.name.toLowerCase() === clean.toLowerCase()) || null;
  } catch {
    return /^[A-Za-z0-9 '&().\/-]{2,40}$/.test(clean) ? { name: clean, codes: [] } : null;
  }
}

// ---------------------------------------------------------------------------
// Live arrivals at one station.
// Returns { station, platforms: [{ id, codes, next: { minutes, destination },
//   following: { minutes, destination } }], fetchedAt }
// "minutes" is a number, 0 = arriving now, null = no estimate.
// ---------------------------------------------------------------------------
export function getTrainArrivals(station) {
  return cached(`mrt:arr:${station.name}`, 15_000, async () => {
    const url = `${SMRT_ARRIVAL_URL}?station=${encodeURIComponent(station.name)}`;
    let rows = [];
    // The feed sometimes answers for the wrong station or with nothing under
    // load; retry once before giving up.
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await getJson(url, SMRT_HEADERS);
      rows = (Array.isArray(data?.results) ? data.results : []).filter(
        (r) => r && (!r.mrt || String(r.mrt).toLowerCase() === station.name.toLowerCase())
      );
      if (rows.length) break;
    }

    const platforms = rows.map((r, i) => normalisePlatform(r, i));
    // Merge rows that describe the same platform.
    const byId = new Map();
    for (const p of platforms) if (!byId.has(p.id)) byId.set(p.id, p);

    return {
      station: station.name,
      codes: station.codes,
      platforms: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
      fetchedAt: new Date().toISOString(),
    };
  });
}

// "5" -> 5, "Arr" / "0" -> 0, "-" / "" / "N/A" -> null
function parseMinutes(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().toLowerCase();
  if (!s || s === "-" || s === "n/a" || s === "na") return null;
  if (s.startsWith("arr")) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Field names in this feed aren't documented, so look for the likely ones
// and fall back gracefully.
function pick(row, ...keys) {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  return null;
}

function normalisePlatform(r, index) {
  const id = String(pick(r, "platform_ID", "platform_id", "platform") || `P${index + 1}`);
  return {
    id,
    codes: splitCodes(r.code),
    next: {
      minutes: parseMinutes(pick(r, "next_train_arr", "next_train_arrival")),
      destination: pick(r, "next_train_destination", "next_train_dest", "destination"),
    },
    following: {
      minutes: parseMinutes(pick(r, "subseq_train_arr", "subsequent_train_arr", "next2_train_arr")),
      destination: pick(r, "subseq_train_destination", "subsequent_train_destination"),
    },
    // Raw status code from the feed (meaning undocumented; 1 in normal samples).
    status: r.status ?? null,
  };
}

// ---------------------------------------------------------------------------
// Network-wide service alerts from LTA DataMall.
// Returns { available, disrupted, messages: [..], segments: [{ line,
//   direction, stations }] }
// ---------------------------------------------------------------------------
export function getTrainAlerts() {
  if (!LTA_KEY) return Promise.resolve({ available: false, disrupted: false, messages: [], segments: [] });
  return cached("mrt:alerts", 60_000, async () => {
    const data = await getJson(`${LTA_BASE}/TrainServiceAlerts`, { AccountKey: LTA_KEY });
    // Seen both as an object and as a one-element array.
    const v = Array.isArray(data?.value) ? data.value[0] || {} : data?.value || {};
    const msgs = Array.isArray(v.Message) ? v.Message : v.Message ? [v.Message] : [];
    const segs = Array.isArray(v.AffectedSegments) ? v.AffectedSegments : [];
    return {
      available: true,
      disrupted: Number(v.Status) === 2,
      messages: msgs.map((m) => (typeof m === "string" ? m : m?.Content)).filter(Boolean),
      segments: segs.map((s) => ({
        line: s.Line || "",
        direction: s.Direction || "",
        stations: s.Stations || "",
      })),
    };
  });
}
