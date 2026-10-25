import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  usePolling,
  useNow,
  minutesUntil,
  etaLabel,
  gmapsDirections,
  MAX_SAVED,
} from "./lib.js";
import {
  StarIcon,
  TargetIcon,
  LocateIcon,
  SearchIcon,
  ChevronIcon,
  MapIcon,
  WheelchairIcon,
  CloseIcon,
} from "./Icons.jsx";
import StopMap from "./StopMap.jsx";

const REFRESH_MS = 20_000;

export default function BusView({ saved, setSaved, target, setTarget }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [nearby, setNearby] = useState(null); // null = not located yet
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const [focusCode, setFocusCode] = useState(null); // stop clicked on the map

  const savedCodes = useMemo(() => saved.map((s) => s.code), [saved]);
  const isSaved = (code) => saved.some((s) => s.code === code);
  const full = saved.length >= MAX_SAVED;

  const toggleSave = (stop) => {
    setSaved((list) =>
      list.some((s) => s.code === stop.code)
        ? list.filter((s) => s.code !== stop.code)
        : list.length >= MAX_SAVED
          ? list
          : [...list, { code: stop.code, name: stop.name, road: stop.road, lat: stop.lat, lng: stop.lng }]
    );
  };

  // ----- search (debounced: waits until you stop typing for 300ms) -----
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api(`bus/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.stops))
        .catch((e) => setError(e.message))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // ----- "near me" -----
  const locate = () => {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Your browser doesn't support location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setPosition({ lat, lng });
        try {
          const d = await api(`bus/nearby?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`);
          setNearby(d.stops);
        } catch (e) {
          setError(e.message);
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Allow it in your browser settings, or search instead."
            : "Couldn't get your location. Try again, or search instead."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  const clearFocus = useMemo(() => () => setFocusCode(null), []);

  const cardProps = (stop) => ({
    stop,
    saved: isSaved(stop.code),
    saveDisabled: full && !isSaved(stop.code),
    onToggleSave: () => toggleSave(stop),
    target,
    setTarget,
  });

  return (
    <div className="view">
      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            inputMode="search"
            placeholder="Stop name or 5-digit code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search bus stops"
          />
          {query && (
            <button className="icon-btn ghost" onClick={() => setQuery("")} aria-label="Clear search">
              <CloseIcon size={16} />
            </button>
          )}
        </label>
        <button className="pill-btn" onClick={locate} disabled={locating}>
          <LocateIcon />
          <span>{locating ? "Locating…" : "Near me"}</span>
        </button>
      </div>

      {error && <p className="notice notice-warn">{error}</p>}

      {query.trim().length >= 2 && (
        <section className="section">
          <h2 className="section-title">
            Search results {searching && <span className="spinner" aria-label="Loading" />}
          </h2>
          {!searching && results.length === 0 && <p className="empty">No stops match “{query}”.</p>}
          <div className="cards">
            {results.map((s) => (
              <StopCard key={`r-${s.code}`} {...cardProps(s)} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">
          Saved stops <span className="count">{saved.length}/{MAX_SAVED}</span>
        </h2>
        {saved.length === 0 ? (
          <p className="empty">
            Tap the <StarIcon size={14} /> on any stop to keep it here. Saved stops stay in this browser only.
          </p>
        ) : (
          <div className="cards">
            {saved.map((s) => (
              <StopCard key={`s-${s.code}`} {...cardProps(s)} defaultOpen />
            ))}
          </div>
        )}
      </section>

      {nearby && (
        <section className="section">
          <h2 className="section-title">Nearby</h2>
          {position && (
            <StopMap
              position={position}
              stops={nearby}
              savedCodes={savedCodes}
              onSelect={setFocusCode}
            />
          )}
          {nearby.length === 0 ? (
            <p className="empty">No bus stops within 800 m.</p>
          ) : (
            <div className="cards">
              {nearby.map((s) => (
                <StopCard
                  key={`n-${s.code}`}
                  {...cardProps(s)}
                  focus={focusCode === s.code}
                  onFocused={clearFocus}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One bus stop: header row, and (when open) the live arrivals.
// ---------------------------------------------------------------------------
function StopCard({ stop, saved, saveDisabled, onToggleSave, target, setTarget, defaultOpen, focus, onFocused }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const ref = useRef(null);

  // When the stop is tapped on the map, open it and scroll it into view.
  useEffect(() => {
    if (!focus) return;
    setOpen(true);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    onFocused?.();
  }, [focus, onFocused]);

  return (
    <article className={`card ${open ? "open" : ""}`} ref={ref}>
      <div className="card-head">
        <button className="card-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="card-title">{stop.name}</span>
          <span className="card-sub">
            {stop.code}
            {stop.road && ` · ${stop.road}`}
            {stop.distanceM !== undefined && ` · ${stop.distanceM} m`}
          </span>
        </button>
        <button
          className={`icon-btn star ${saved ? "on" : ""}`}
          onClick={onToggleSave}
          disabled={saveDisabled}
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save stop"}
          title={saveDisabled ? `Saved list is full (${MAX_SAVED}/${MAX_SAVED})` : saved ? "Remove from saved" : "Save stop"}
        >
          <StarIcon filled={saved} />
        </button>
        <button className="icon-btn ghost chevron" onClick={() => setOpen(!open)} aria-hidden="true" tabIndex={-1}>
          <ChevronIcon />
        </button>
      </div>
      {open && <Arrivals stop={stop} target={target} setTarget={setTarget} />}
    </article>
  );
}

function Arrivals({ stop, target, setTarget }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const now = useNow(1000);

  usePolling(
    () =>
      api(`bus/stops/${stop.code}`)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => setError(e.message)),
    REFRESH_MS,
    [stop.code]
  );

  const lat = stop.lat ?? data?.stop?.lat;
  const lng = stop.lng ?? data?.stop?.lng;
  const name = stop.name || data?.stop?.name || stop.code;

  return (
    <div className="card-body">
      {error && !data && <p className="notice notice-warn">{error}</p>}
      {!data && !error && <p className="loading">Loading arrivals…</p>}
      {data && data.services.length === 0 && <p className="empty">No buses in service at this stop right now.</p>}
      {data && data.services.length > 0 && (
        <ul className="rows">
          {data.services.map((svc) => {
            const isTarget = target?.code === stop.code && target?.no === svc.no;
            return (
              <li key={svc.no} className={`row ${isTarget ? "is-target" : ""}`}>
                <span className="badge bus-badge">{svc.no}</span>
                <span className="row-main">
                  <span className="row-dest">{svc.destination ? `to ${svc.destination}` : svc.operator}</span>
                  <span className="etas">
                    {svc.buses.length === 0 && <span className="eta muted">No estimate</span>}
                    {svc.buses.map((b, i) => (
                      <span key={i} className={`eta ${i === 0 ? "eta-first" : ""}`}>
                        <span className={`load load-${b.load || "unknown"}`} title={loadTitle(b.load)} />
                        {etaLabel(minutesUntil(b.eta, now))}
                        {b.type === "double" && <span className="tag">DD</span>}
                        {b.type === "bendy" && <span className="tag">BD</span>}
                        {b.wheelchair && <WheelchairIcon className="wab" />}
                      </span>
                    ))}
                  </span>
                </span>
                <button
                  className={`icon-btn target ${isTarget ? "on" : ""}`}
                  aria-pressed={isTarget}
                  title={isTarget ? "Stop tracking this bus" : "Track this bus"}
                  aria-label={isTarget ? `Stop tracking bus ${svc.no}` : `Track bus ${svc.no}`}
                  onClick={() =>
                    setTarget(isTarget ? null : { code: stop.code, stopName: name, no: svc.no, lat, lng })
                  }
                >
                  <TargetIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="card-foot">
        <span className="legend">
          <span className="load load-seats" /> seats <span className="load load-standing" /> standing{" "}
          <span className="load load-full" /> full
        </span>
        {lat && lng && (
          <a className="link" href={gmapsDirections(lat, lng)} target="_blank" rel="noopener noreferrer">
            <MapIcon size={15} /> Walk here in Google Maps
          </a>
        )}
      </div>
    </div>
  );
}

const loadTitle = (load) =>
  ({ seats: "Seats available", standing: "Standing available", full: "Limited standing" })[load] ||
  "Load unknown";
