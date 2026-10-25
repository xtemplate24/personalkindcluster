// Bus data: stop list, nearby search and live arrivals.
//
// Primary source: LTA DataMall (official, free account key from
//   https://datamall.lta.gov.sg -> "Request for API Access").
// Fallback when no key is set: the community BusRouter SG / arrivelah feeds,
//   which re-publish the same LTA data without a key. Handy for trying the app
//   out, but there's no SLA, so set LTA_ACCOUNT_KEY for real use.

import { cached, getJson, distanceM, UpstreamError } from "./util.js";

const LTA_KEY = process.env.LTA_ACCOUNT_KEY || "";
const LTA_BASE = process.env.LTA_BASE_URL || "https://datamall2.mytransport.sg/ltaodataservice";
const BUSROUTER_STOPS_URL =
  process.env.BUSROUTER_STOPS_URL || "https://data.busrouter.sg/v1/stops.min.json";
const ARRIVELAH_URL = process.env.ARRIVELAH_URL || "https://arrivelah2.busrouter.sg/";

export const busSource = LTA_KEY ? "lta-datamall" : "busrouter (no LTA key set)";

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Bus stop list (~5,000 stops). Fetched once, kept in memory for a day.
// Each stop: { code, name, road, lat, lng }
// ---------------------------------------------------------------------------
export function getAllStops() {
  return cached("bus:stops", DAY, LTA_KEY ? loadStopsFromLta : loadStopsFromBusRouter);
}

async function loadStopsFromLta() {
  // DataMall pages results 500 at a time; keep asking with $skip until a
  // short page comes back. 40 pages is a safety stop (that's 20,000 stops).
  const stops = [];
  for (let page = 0; page < 40; page++) {
    const data = await getJson(`${LTA_BASE}/BusStops?$skip=${page * 500}`, {
      AccountKey: LTA_KEY,
    });
    const rows = Array.isArray(data?.value) ? data.value : [];
    for (const r of rows) {
      const lat = Number(r.Latitude);
      const lng = Number(r.Longitude);
      if (!r.BusStopCode || !lat || !lng) continue;
      stops.push({
        code: String(r.BusStopCode),
        name: r.Description || r.BusStopCode,
        road: r.RoadName || "",
        lat,
        lng,
      });
    }
    if (rows.length < 500) break;
  }
  if (!stops.length) throw new UpstreamError("bus stop list came back empty");
  return stops;
}

async function loadStopsFromBusRouter() {
  // Format: { "01012": [lng, lat, "Hotel Grand Pacific", "Victoria St"], ... }
  const data = await getJson(BUSROUTER_STOPS_URL, {}, 15000);
  const stops = [];
  for (const [code, v] of Object.entries(data || {})) {
    if (!Array.isArray(v) || v.length < 3) continue;
    let [a, b] = v.map(Number);
    // Singapore is around lat 1.3, lng 103.8: whichever number is > 90 is lng.
    const [lat, lng] = a > 90 ? [b, a] : [a, b];
    if (!lat || !lng) continue;
    stops.push({ code, name: String(v[2] || code), road: String(v[3] || ""), lat, lng });
  }
  if (!stops.length) throw new UpstreamError("bus stop list came back empty");
  return stops;
}

async function stopsByCode() {
  return cached("bus:stopsByCode", DAY, async () => {
    const map = new Map();
    for (const s of await getAllStops()) map.set(s.code, s);
    return map;
  });
}

export async function getStop(code) {
  return (await stopsByCode()).get(code) || null;
}

// ---------------------------------------------------------------------------
// Nearby + search
// ---------------------------------------------------------------------------
export async function nearbyStops(lat, lng, limit = 10, radiusM = 800) {
  const stops = await getAllStops();
  return stops
    .map((s) => ({ ...s, distanceM: distanceM(lat, lng, s.lat, s.lng) }))
    .filter((s) => s.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

export async function searchStops(q, limit = 20) {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const stops = await getAllStops();
  // A 5-digit code is an exact lookup; anything else matches name or road.
  if (/^\d{5}$/.test(query)) return stops.filter((s) => s.code === query);
  const starts = [];
  const contains = [];
  for (const s of stops) {
    const name = s.name.toLowerCase();
    const road = s.road.toLowerCase();
    if (s.code.startsWith(query) || name.startsWith(query)) starts.push(s);
    else if (name.includes(query) || road.includes(query)) contains.push(s);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

// ---------------------------------------------------------------------------
// Live arrivals for one stop.
// Returns { code, services: [{ no, operator, buses: [{ eta, load, type,
//   wheelchair, lat, lng, destination }] }], source, fetchedAt }
// "eta" is an ISO timestamp; the browser turns it into a live countdown.
// ---------------------------------------------------------------------------
export function getArrivals(code) {
  return cached(`bus:arr:${code}`, 15_000, async () => {
    const services = LTA_KEY ? await arrivalsFromLta(code) : await arrivalsFromArrivelah(code);
    const byCode = await stopsByCode().catch(() => new Map());
    for (const svc of services) {
      for (const bus of svc.buses) {
        const dest = bus.destinationCode && byCode.get(bus.destinationCode);
        bus.destination = dest ? dest.name : null;
      }
      svc.destination = svc.buses.find((b) => b.destination)?.destination || null;
    }
    // Natural sort so "2" comes before "10" and "10e".
    services.sort((a, b) => a.no.localeCompare(b.no, undefined, { numeric: true }));
    return { code, services, source: busSource, fetchedAt: new Date().toISOString() };
  });
}

const LOAD = { SEA: "seats", SDA: "standing", LSD: "full" };
const TYPE = { SD: "single", DD: "double", BD: "bendy" };

async function arrivalsFromLta(code) {
  const data = await getJson(
    `${LTA_BASE}/v3/BusArrival?BusStopCode=${encodeURIComponent(code)}`,
    { AccountKey: LTA_KEY }
  );
  const services = Array.isArray(data?.Services) ? data.Services : [];
  return services.map((s) => ({
    no: String(s.ServiceNo),
    operator: s.Operator || "",
    buses: [s.NextBus, s.NextBus2, s.NextBus3]
      .filter((b) => b && b.EstimatedArrival)
      .map((b) => ({
        eta: b.EstimatedArrival,
        load: LOAD[b.Load] || null,
        type: TYPE[b.Type] || null,
        wheelchair: b.Feature === "WAB",
        lat: Number(b.Latitude) || null,
        lng: Number(b.Longitude) || null,
        destinationCode: b.DestinationCode || null,
      })),
  }));
}

async function arrivalsFromArrivelah(code) {
  const data = await getJson(`${ARRIVELAH_URL}?id=${encodeURIComponent(code)}`);
  const services = Array.isArray(data?.services) ? data.services : [];
  return services.map((s) => ({
    no: String(s.no),
    operator: s.operator || "",
    buses: [s.next, s.next2 || s.subsequent, s.next3]
      .filter((b) => b && b.time)
      .map((b) => ({
        eta: b.time,
        load: LOAD[b.load] || null,
        type: TYPE[b.type] || null,
        wheelchair: b.feature === "WAB",
        lat: Number(b.lat) || null,
        lng: Number(b.lng) || null,
        destinationCode: b.destination_code || null,
      })),
  }));
}
