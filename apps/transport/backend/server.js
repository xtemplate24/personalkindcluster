import express from "express";
import * as bus from "./lib/bus.js";
import * as mrt from "./lib/mrt.js";
import { rateLimit } from "./lib/util.js";

const app = express();
app.disable("x-powered-by");

const PORT = process.env.PORT || 8080;

// Used by the Deployment's readiness/liveness probes.
app.get("/healthz", (req, res) => res.status(200).send("ok"));

// Everything under /api is rate limited per visitor.
app.use("/api", rateLimit({ perMinute: Number(process.env.RATE_LIMIT_PER_MIN) || 240 }));

// Wraps an async route so errors become clean JSON instead of crashing.
const route = (fn) => async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    // Every JSON reply carries the server's clock so the browser can correct
    // for a phone whose clock is off (bus ETAs are absolute timestamps).
    const json = res.json.bind(res);
    res.json = (body) =>
      json(body && typeof body === "object" && !Array.isArray(body)
        ? { ...body, serverTime: new Date().toISOString() }
        : body);
    await fn(req, res);
  } catch (err) {
    console.error(`${req.method} ${req.path}:`, err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : "internal error" });
  }
};

// Singapore's rough bounding box, so we don't search the whole world.
const inSingapore = (lat, lng) => lat > 1.1 && lat < 1.5 && lng > 103.5 && lng < 104.2;

// ---------------------------- bus ----------------------------

// GET /api/bus/nearby?lat=1.30&lng=103.85
app.get(
  "/api/bus/nearby",
  route(async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "lat and lng are required" });
    }
    if (!inSingapore(lat, lng)) {
      return res.status(400).json({ error: "That location is outside Singapore." });
    }
    res.json({ stops: await bus.nearbyStops(lat, lng, 12) });
  })
);

// GET /api/bus/search?q=orchard   (or a 5-digit stop code)
app.get(
  "/api/bus/search",
  route(async (req, res) => {
    const q = String(req.query.q || "").slice(0, 60);
    if (q.trim().length < 2) return res.json({ stops: [] });
    res.json({ stops: await bus.searchStops(q) });
  })
);

// GET /api/bus/stops/83139  -> stop details + live arrivals
app.get(
  "/api/bus/stops/:code",
  route(async (req, res) => {
    const { code } = req.params;
    if (!/^\d{5}$/.test(code)) return res.status(400).json({ error: "Bus stop codes are 5 digits." });
    const [stop, arrivals] = await Promise.all([
      bus.getStop(code).catch(() => null),
      bus.getArrivals(code),
    ]);
    res.json({ stop, ...arrivals });
  })
);

// ---------------------------- MRT ----------------------------

// GET /api/mrt/stations
app.get(
  "/api/mrt/stations",
  route(async (req, res) => res.json({ stations: await mrt.getStations() }))
);

// GET /api/mrt/arrivals?station=Paya%20Lebar
app.get(
  "/api/mrt/arrivals",
  route(async (req, res) => {
    const station = await mrt.resolveStation(req.query.station);
    if (!station) return res.status(404).json({ error: "Unknown station." });
    res.json(await mrt.getTrainArrivals(station));
  })
);

// GET /api/mrt/alerts
app.get(
  "/api/mrt/alerts",
  route(async (req, res) => res.json(await mrt.getTrainAlerts()))
);

// ---------------------------- meta ----------------------------

app.get("/api/info", (req, res) => {
  res.json({ busSource: bus.busSource, alerts: Boolean(process.env.LTA_ACCOUNT_KEY) });
});

app.use("/api", (req, res) => res.status(404).json({ error: "not found" }));

app.listen(PORT, () => {
  console.log(`transport-backend listening on ${PORT} (bus source: ${bus.busSource})`);
  // Warm the stop list in the background so the first visitor doesn't wait.
  bus.getAllStops().then(
    (s) => console.log(`loaded ${s.length} bus stops`),
    (e) => console.error("bus stop preload failed:", e.message)
  );
});
