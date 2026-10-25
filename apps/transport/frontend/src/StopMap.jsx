import { useEffect, useRef, useState } from "react";

// Map of nearby stops. Leaflet is bundled into our own image (no CDN), and
// loaded only when the map is first shown so the main page stays small.
// Tiles: CARTO's dark basemap (OpenStreetMap data), which matches the dark
// aurora theme. Since Sept 2026 CARTO needs a free key; the frontend server
// hands it to the page via /config.json (from a Kubernetes Secret). With no
// key we fall back to the standard OpenStreetMap tiles so the map still works.
// Tapping a stop opens its card below.

let configPromise = null;
const loadConfig = () =>
  (configPromise ||= fetch("/config.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({})));

const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
export default function StopMap({ position, stops, savedCodes, onSelect }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const fittedFor = useRef(null); // only re-zoom when the stop list changes
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        await import("leaflet/dist/leaflet.css");
        const { cartoKey } = await loadConfig();
        if (cancelled || !el.current) return;

        if (!map.current) {
          map.current = L.map(el.current, { zoomControl: false, attributionControl: true });
          const tiles = cartoKey
            ? L.tileLayer(
                `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
                {
                  maxZoom: 19,
                  subdomains: "abcd",
                  attribution: `${OSM} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
                }
              )
            : L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 19,
                attribution: OSM,
              });
          tiles.addTo(map.current);
          L.control.zoom({ position: "bottomright" }).addTo(map.current);
        }

        layer.current?.remove();
        layer.current = L.layerGroup().addTo(map.current);

        // You are here
        L.circleMarker([position.lat, position.lng], {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: "#67e8f9",
          fillOpacity: 1,
          className: "me-dot",
        })
          .bindTooltip("You are here")
          .addTo(layer.current);

        const bounds = [[position.lat, position.lng]];
        for (const s of stops) {
          const saved = savedCodes.includes(s.code);
          L.circleMarker([s.lat, s.lng], {
            radius: 7,
            color: saved ? "#f2a65a" : "#6fd6c4",
            weight: 2,
            fillColor: saved ? "#f2a65a" : "#0b1a1d",
            fillOpacity: 0.9,
          })
            .bindTooltip(`${s.name} · ${s.code}`)
            .on("click", () => onSelect(s.code))
            .addTo(layer.current);
          bounds.push([s.lat, s.lng]);
        }
        if (fittedFor.current !== stops) {
          map.current.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });
          fittedFor.current = stops;
        }
      } catch (e) {
        console.error(e);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [position, stops, savedCodes, onSelect]);

  // Tear the map down when the component goes away.
  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    []
  );

  if (failed) return null;
  return <div className="map" ref={el} role="region" aria-label="Map of nearby bus stops" />;
}
