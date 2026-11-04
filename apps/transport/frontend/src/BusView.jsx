import { useEffect, useMemo, useRef, useState } from "react";
import { api, usePolling, useNow, minutesUntil, etaLabel, gmapsDirections, MAX_FAVS } from "./lib.js";
import {
  StarIcon,
  PinIcon,
  LocateIcon,
  SearchIcon,
  ChevronIcon,
  MapIcon,
  WheelchairIcon,
  CloseIcon,
} from "./Icons.jsx";
import StopMap from "./StopMap.jsx";

const REFRESH_MS = 20_000;

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function BusView({ tab, favs, setFavs, pinned, setPinned }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [nearby, setNearby] = useState(null); // null = "Near me" is off
  const [position, setPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState(null);
  const [focusCode, setFocusCode] = useState(null); // stop clicked on the map
  // While searching or using "Near me", favourites fold into one button so
  // the results come first. This is whether that button has been opened.
  const [favsOpen, setFavsOpen] = useState(false);

  // ----- favourites (for the tab that's showing) -----
  const busFavs = favs.filter((f) => f.type === "bus");
  const stopFavs = favs.filter((f) => f.type === "stop");
  const busesFull = busFavs.length >= MAX_FAVS;
  const stopsFull = stopFavs.length >= MAX_FAVS;
  const savedCodes = useMemo(() => [...new Set(favs.map((f) => f.code))], [favs]);

  const isStopFav = (code) => stopFavs.some((f) => f.code === code);
  const isBusFav = (code, no) => busFavs.some((f) => f.code === code && f.no === no);

  const toggleStopFav = (stop) =>
    setFavs((list) => {
      const match = (f) => f.type === "stop" && f.code === stop.code;
      if (list.some(match)) return list.filter((f) => !match(f));
      if (list.filter((f) => f.type === "stop").length >= MAX_FAVS) return list;
      return [...list, { type: "stop", code: stop.code, name: stop.name, road: stop.road, lat: stop.lat, lng: stop.lng }];
    });

  const toggleBusFav = (stop, no) =>
    setFavs((list) => {
      const match = (f) => f.type === "bus" && f.code === stop.code && f.no === no;
      if (list.some(match)) return list.filter((f) => !match(f));
      if (list.filter((f) => f.type === "bus").length >= MAX_FAVS) return list;
      return [
        ...list,
        { type: "bus", code: stop.code, no, stopName: stop.name, road: stop.road, lat: stop.lat, lng: stop.lng },
      ];
    });

  // ----- search (debounced: waits until you stop typing for 300ms) -----
  useEffect(() => {
    setFavsOpen(false); // a new search folds favourites away again
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

  // ----- "near me" (press again to turn it off) -----
  const locate = () => {
    setError(null);
    if (nearby) {
      setNearby(null);
      setPosition(null);
      return;
    }
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
          setFavsOpen(false);
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

  // Everything a bus row needs to draw its star and pin buttons.
  const rowActions = { isBusFav, toggleBusFav, busesFull, pinned, setPinned };

  const cardProps = (stop) => ({
    stop,
    starred: isStopFav(stop.code),
    starDisabled: stopsFull && !isStopFav(stop.code),
    onToggleStar: () => toggleStopFav(stop),
    rowActions,
  });

  const listName = tab.toUpperCase();
  const searchActive = query.trim().length >= 2;
  const folded = searchActive || nearby !== null;

  const favourites = (
    <>
      <section className="section">
        <h2 className="section-title" aria-label={`${listName} saved buses, ${busFavs.length} of ${MAX_FAVS}`}>
          <span className="grow">Saved buses</span>
          <StarIcon size={13} className="title-star" />
          <span className="count">
            {busFavs.length}/{MAX_FAVS}
          </span>
        </h2>
        {busFavs.length === 0 ? (
          <p className="empty">
            Open a stop and tap the <StarIcon size={14} /> next to a bus to keep that bus, at that stop, here.
          </p>
        ) : (
          <div className="cards">
            {busFavs.map((f) => (
              <BusFavCard
                key={`b-${f.code}-${f.no}`}
                fav={f}
                onUnfav={() => toggleBusFav({ code: f.code }, f.no)}
                pinned={pinned}
                setPinned={setPinned}
              />
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2 className="section-title" aria-label={`${listName} saved stops, ${stopFavs.length} of ${MAX_FAVS}`}>
          <span className="grow">Saved stops</span>
          <StarIcon size={13} className="title-star" />
          <span className="count">
            {stopFavs.length}/{MAX_FAVS}
          </span>
        </h2>
        {stopFavs.length === 0 ? (
          <p className="empty">
            Tap the <StarIcon size={14} /> on a stop to keep the whole stop here.
          </p>
        ) : (
          <div className="cards">
            {stopFavs.map((s) => (
              <StopCard key={`s-${s.code}`} {...cardProps(s)} />
            ))}
          </div>
        )}
        <p className="fineprint">
          Stars you add now go to the <strong>{listName}</strong> list.
        </p>
      </section>
    </>
  );

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
        <button
          className={`pill-btn ${nearby ? "on" : ""}`}
          onClick={locate}
          disabled={locating}
          aria-pressed={Boolean(nearby)}
          title={nearby ? "Turn off Near me" : "Show stops near me"}
        >
          <LocateIcon />
          <span>{locating ? "Locating…" : "Near me"}</span>
          {nearby && <CloseIcon size={14} />}
        </button>
      </div>

      {error && <p className="notice notice-warn">{error}</p>}

      {folded ? (
        <>
          <button className={`fav-toggle ${favsOpen ? "open" : ""}`} onClick={() => setFavsOpen(!favsOpen)} aria-expanded={favsOpen}>
            <StarIcon className="fav-toggle-star" />
            <span className="fav-toggle-text">
              <span className="fav-toggle-title">Your favourites</span>
              <span className="fav-toggle-sub">
                {listName} · {plural(busFavs.length, "bus", "buses")} · {plural(stopFavs.length, "stop", "stops")}
              </span>
            </span>
            <span className="group-hint">{favsOpen ? "Hide" : "Show"}</span>
            <span className="chevron">
              <ChevronIcon />
            </span>
          </button>
          {favsOpen && <div className="fav-folded">{favourites}</div>}
        </>
      ) : (
        favourites
      )}

      {searchActive && (
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

      {nearby && (
        <section className="section">
          <h2 className="section-title">Nearby</h2>
          {position && (
            <StopMap position={position} stops={nearby} savedCodes={savedCodes} onSelect={setFocusCode} />
          )}
          {nearby.length === 0 ? (
            <p className="empty">No bus stops within 800 m.</p>
          ) : (
            <div className="cards">
              {nearby.map((s) => (
                <StopCard key={`n-${s.code}`} {...cardProps(s)} focus={focusCode === s.code} onFocused={clearFocus} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A favourited bus at a stop: always shows its live arrivals.
// ---------------------------------------------------------------------------
function BusFavCard({ fav, onUnfav, pinned, setPinned }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const now = useNow(1000);

  // api() shares results for a few seconds, so several favourites at the
  // same stop only cause one request.
  usePolling(
    () =>
      api(`bus/stops/${fav.code}`)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => setError(e.message)),
    REFRESH_MS,
    [fav.code]
  );

  const svc = data?.services.find((s) => s.no === fav.no);
  const isPinned = pinned?.code === fav.code && pinned?.no === fav.no;
  const stopName = fav.stopName || data?.stop?.name || fav.code;

  return (
    <article className={`card busfav ${isPinned ? "is-pinned" : ""}`}>
      <span className="badge bus-badge">{fav.no}</span>
      <span className="row-main">
        <span className="busfav-stop">{stopName}</span>
        <span className="card-sub">
          {fav.code}
          {svc?.destination ? ` · to ${svc.destination}` : fav.road ? ` · ${fav.road}` : ""}
        </span>
        <span className="etas">
          {!data && !error && <span className="eta muted">Loading…</span>}
          {error && !data && <span className="eta muted">Couldn't load arrivals</span>}
          {data && !svc && <span className="eta muted">Not running right now</span>}
          {svc && <EtaList buses={svc.buses} now={now} />}
        </span>
      </span>
      <span className="busfav-actions">
        <button
          className="icon-btn star on"
          onClick={onUnfav}
          aria-label={`Remove bus ${fav.no} at ${stopName} from favourites`}
          title="Remove from favourites"
        >
          <StarIcon filled size={19} />
        </button>
        <PinButton
          no={fav.no}
          isPinned={isPinned}
          onClick={() =>
            setPinned(isPinned ? null : { code: fav.code, stopName, no: fav.no, lat: fav.lat, lng: fav.lng })
          }
        />
      </span>
    </article>
  );
}

// ---------------------------------------------------------------------------
// One bus stop: header row, and (when open) the live arrivals.
// ---------------------------------------------------------------------------
function StopCard({ stop, starred, starDisabled, onToggleStar, rowActions, focus, onFocused }) {
  const [open, setOpen] = useState(false);
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
          className={`icon-btn star ${starred ? "on" : ""}`}
          onClick={onToggleStar}
          disabled={starDisabled}
          aria-pressed={starred}
          aria-label={starred ? "Remove stop from favourites" : "Favourite the whole stop"}
          title={
            starDisabled
              ? `Saved stops are full (${MAX_FAVS}/${MAX_FAVS})`
              : starred
                ? "Remove stop from favourites"
                : "Favourite the whole stop"
          }
        >
          <StarIcon filled={starred} />
        </button>
        <button className="icon-btn ghost chevron" onClick={() => setOpen(!open)} aria-hidden="true" tabIndex={-1}>
          <ChevronIcon />
        </button>
      </div>
      {open && <Arrivals stop={stop} {...rowActions} />}
    </article>
  );
}

function Arrivals({ stop, isBusFav, toggleBusFav, busesFull, pinned, setPinned }) {
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
  const road = stop.road ?? data?.stop?.road;

  return (
    <div className="card-body">
      {error && !data && <p className="notice notice-warn">{error}</p>}
      {!data && !error && <p className="loading">Loading arrivals…</p>}
      {data && data.services.length === 0 && <p className="empty">No buses in service at this stop right now.</p>}
      {data && data.services.length > 0 && (
        <ul className="rows">
          {data.services.map((svc) => {
            const isPinned = pinned?.code === stop.code && pinned?.no === svc.no;
            const fav = isBusFav(stop.code, svc.no);
            return (
              <li key={svc.no} className={`row ${isPinned ? "is-pinned" : ""}`}>
                <span className="badge bus-badge">{svc.no}</span>
                <span className="row-main">
                  <span className="row-dest">{svc.destination ? `to ${svc.destination}` : svc.operator}</span>
                  <span className="etas">
                    <EtaList buses={svc.buses} now={now} />
                  </span>
                </span>
                <button
                  className={`icon-btn star ${fav ? "on" : ""}`}
                  disabled={busesFull && !fav}
                  aria-pressed={fav}
                  aria-label={fav ? `Remove bus ${svc.no} from favourites` : `Favourite bus ${svc.no} at this stop`}
                  title={
                    busesFull && !fav
                      ? `Saved buses are full (${MAX_FAVS}/${MAX_FAVS})`
                      : fav
                        ? "Remove from favourites"
                        : "Favourite this bus at this stop"
                  }
                  onClick={() => toggleBusFav({ code: stop.code, name, road, lat, lng }, svc.no)}
                >
                  <StarIcon filled={fav} size={19} />
                </button>
                <PinButton
                  no={svc.no}
                  isPinned={isPinned}
                  onClick={() => setPinned(isPinned ? null : { code: stop.code, stopName: name, no: svc.no, lat, lng })}
                />
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

// The next few buses for one service: "3 min  11 min  19 min".
function EtaList({ buses, now }) {
  if (buses.length === 0) return <span className="eta muted">No estimate</span>;
  return buses.map((b, i) => (
    <span key={i} className={`eta ${i === 0 ? "eta-first" : ""}`}>
      <span className={`load load-${b.load || "unknown"}`} title={loadTitle(b.load)} />
      {etaLabel(minutesUntil(b.eta, now))}
      {b.type === "double" && <span className="tag">DD</span>}
      {b.type === "bendy" && <span className="tag">BD</span>}
      {b.wheelchair && <WheelchairIcon className="wab" />}
    </span>
  ));
}

// Pins the bus to the countdown bar at the bottom of the screen.
function PinButton({ no, isPinned, onClick }) {
  return (
    <button
      className={`icon-btn pin ${isPinned ? "on" : ""}`}
      aria-pressed={isPinned}
      title={isPinned ? "Unpin this bus" : "Pin this bus to the bottom bar"}
      aria-label={isPinned ? `Unpin bus ${no}` : `Pin bus ${no}`}
      onClick={onClick}
    >
      <PinIcon size={19} />
    </button>
  );
}

const loadTitle = (load) =>
  ({ seats: "Seats available", standing: "Standing available", full: "Limited standing" })[load] ||
  "Load unknown";
