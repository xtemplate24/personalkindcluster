import { useEffect, useMemo, useState } from "react";
import { api, usePolling, etaLabel, gmapsSearch, lineColour, MAX_SAVED } from "./lib.js";
import { StarIcon, TargetIcon, SearchIcon, ChevronIcon, MapIcon, AlertIcon, CloseIcon } from "./Icons.jsx";

const REFRESH_MS = 20_000;

export default function MrtView({ saved, setSaved, target, setTarget }) {
  const [stations, setStations] = useState(null);
  const [listError, setListError] = useState(null);
  const [query, setQuery] = useState("");
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    api("mrt/stations")
      .then((d) => setStations(d.stations))
      .catch((e) => setListError(e.message));
  }, []);

  usePolling(
    () =>
      api("mrt/alerts")
        .then(setAlerts)
        .catch(() => {}),
    60_000
  );

  // Match on station name or code ("NS10", "paya").
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!stations || q.length < 1) return [];
    return stations
      .filter((s) => s.name.toLowerCase().includes(q) || s.codes.some((c) => c.toLowerCase().startsWith(q)))
      .slice(0, 12);
  }, [stations, query]);

  const isSaved = (name) => saved.some((s) => s.name === name);
  const full = saved.length >= MAX_SAVED;
  const toggleSave = (st) =>
    setSaved((list) =>
      list.some((s) => s.name === st.name)
        ? list.filter((s) => s.name !== st.name)
        : list.length >= MAX_SAVED
          ? list
          : [...list, { name: st.name, codes: st.codes }]
    );

  const cardProps = (st) => ({
    station: st,
    saved: isSaved(st.name),
    saveDisabled: full && !isSaved(st.name),
    onToggleSave: () => toggleSave(st),
    target,
    setTarget,
  });

  return (
    <div className="view">
      {alerts?.disrupted && (
        <div className="notice notice-alert" role="status">
          <AlertIcon />
          <div>
            <strong>Train service disruption</strong>
            {alerts.segments.map((s, i) => (
              <p key={i}>
                {s.line} {s.direction && `towards ${s.direction}`}: {s.stations}
              </p>
            ))}
            {alerts.messages.map((m, i) => (
              <p key={`m${i}`}>{m}</p>
            ))}
          </div>
        </div>
      )}

      <div className="toolbar">
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder={stations ? "Station name or code (e.g. NS10)" : "Loading stations…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search MRT stations"
            disabled={!stations}
          />
          {query && (
            <button className="icon-btn ghost" onClick={() => setQuery("")} aria-label="Clear search">
              <CloseIcon size={16} />
            </button>
          )}
        </label>
      </div>

      {listError && <p className="notice notice-warn">Couldn't load the station list: {listError}</p>}

      {query.trim() && stations && (
        <section className="section">
          <h2 className="section-title">Stations</h2>
          {results.length === 0 && <p className="empty">No stations match “{query}”.</p>}
          <div className="cards">
            {results.map((st) => (
              <StationCard key={`r-${st.name}`} {...cardProps(st)} />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">
          Saved stations <span className="count">{saved.length}/{MAX_SAVED}</span>
        </h2>
        {saved.length === 0 ? (
          <p className="empty">
            Search for a station and tap the <StarIcon size={14} /> to keep it here.
          </p>
        ) : (
          <div className="cards">
            {saved.map((st) => (
              <StationCard key={`s-${st.name}`} {...cardProps(st)} defaultOpen />
            ))}
          </div>
        )}
      </section>

      <p className="fineprint">
        Live train times come from SMRT and cover the North-South, East-West, Circle, Thomson-East Coast lines and
        Bukit Panjang LRT. North East, Downtown and Sengkang/Punggol LRT (SBS Transit) don't publish live times.
      </p>
    </div>
  );
}

export function LineBadges({ codes }) {
  return (
    <span className="lines">
      {codes.map((c) => (
        <span key={c} className="line-badge" style={{ "--line": lineColour(c) }}>
          {c}
        </span>
      ))}
    </span>
  );
}

function StationCard({ station, saved, saveDisabled, onToggleSave, target, setTarget, defaultOpen }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <article className={`card ${open ? "open" : ""}`}>
      <div className="card-head">
        <button className="card-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="card-title">{station.name}</span>
          <LineBadges codes={station.codes} />
        </button>
        <button
          className={`icon-btn star ${saved ? "on" : ""}`}
          onClick={onToggleSave}
          disabled={saveDisabled}
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save station"}
          title={saveDisabled ? `Saved list is full (${MAX_SAVED}/${MAX_SAVED})` : saved ? "Remove from saved" : "Save station"}
        >
          <StarIcon filled={saved} />
        </button>
        <button className="icon-btn ghost chevron" onClick={() => setOpen(!open)} aria-hidden="true" tabIndex={-1}>
          <ChevronIcon />
        </button>
      </div>
      {open && <Platforms station={station} target={target} setTarget={setTarget} />}
    </article>
  );
}

function Platforms({ station, target, setTarget }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  usePolling(
    () =>
      api(`mrt/arrivals?station=${encodeURIComponent(station.name)}`)
        .then((d) => {
          setData(d);
          setError(null);
        })
        .catch((e) => setError(e.message)),
    REFRESH_MS,
    [station.name]
  );

  return (
    <div className="card-body">
      {error && !data && <p className="notice notice-warn">{error}</p>}
      {!data && !error && <p className="loading">Loading train times…</p>}
      {data && data.platforms.length === 0 && (
        <p className="empty">No live train times right now (outside operating hours, or not published).</p>
      )}
      {data && data.platforms.length > 0 && (
        <ul className="rows">
          {data.platforms.map((p) => {
            const isTarget = target?.station === station.name && target?.platform === p.id;
            const dest = p.next.destination || p.following.destination;
            return (
              <li key={p.id} className={`row ${isTarget ? "is-target" : ""}`}>
                <span className="badge platform-badge" title="Platform">
                  {shortPlatform(p.id)}
                </span>
                <span className="row-main">
                  <span className="row-dest">
                    {dest ? `towards ${dest}` : `Platform ${shortPlatform(p.id)}`}
                    {p.codes.length > 0 && <LineBadges codes={p.codes} />}
                  </span>
                  <span className="etas">
                    <span className="eta eta-first">{etaLabel(p.next.minutes)}</span>
                    {p.following.minutes !== null && (
                      <span className="eta">
                        then {etaLabel(p.following.minutes)}
                        {p.following.destination && p.following.destination !== p.next.destination && (
                          <span className="muted"> to {p.following.destination}</span>
                        )}
                      </span>
                    )}
                  </span>
                </span>
                <button
                  className={`icon-btn target ${isTarget ? "on" : ""}`}
                  aria-pressed={isTarget}
                  title={isTarget ? "Stop tracking this train" : "Track this train"}
                  aria-label={isTarget ? "Stop tracking this train" : `Track train towards ${dest || p.id}`}
                  onClick={() =>
                    setTarget(isTarget ? null : { station: station.name, platform: p.id, destination: dest || null })
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
        <span className="legend">Times are minutes until the train reaches the platform.</span>
        <a
          className="link"
          href={gmapsSearch(`${station.name} MRT station, Singapore`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MapIcon size={15} /> Open in Google Maps
        </a>
      </div>
    </div>
  );
}

// "CPYL_A" -> "A"; anything without an underscore is shown as-is.
export const shortPlatform = (id) => {
  const m = String(id).match(/_([A-Z0-9]+)$/i);
  return m ? m[1] : String(id);
};
