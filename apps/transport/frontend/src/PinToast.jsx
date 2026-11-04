import { useEffect, useState } from "react";
import { api, usePolling, useNow, countdown, clockTime } from "./lib.js";
import { PinIcon, CloseIcon } from "./Icons.jsx";

const REFRESH_MS = 20_000;

// The pinned bus stays in a bar at the bottom of the screen until you close
// it. It's saved in localStorage, so it survives a page reload and shows on
// both the AM and PM tabs.
export default function PinToast({ pinned, setPinned }) {
  const [label, setLabel] = useState(null);

  // Put the countdown in the browser tab title, so it's visible even when
  // you switch tabs.
  useEffect(() => {
    document.title = label ? `${label} — Bus timings` : "Bus timings";
  }, [label]);

  if (!pinned) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      <BusToast
        key={`${pinned.code}-${pinned.no}`}
        target={pinned}
        onClose={() => {
          setPinned(null);
          setLabel(null);
        }}
        onLabel={setLabel}
      />
    </div>
  );
}

function BusToast({ target, onClose, onLabel }) {
  const [svc, setSvc] = useState(undefined); // undefined = loading, null = not running
  const [error, setError] = useState(null);
  const now = useNow(1000);

  usePolling(
    () =>
      api(`bus/stops/${target.code}`)
        .then((d) => {
          setSvc(d.services.find((s) => s.no === target.no) || null);
          setError(null);
        })
        .catch((e) => setError(e.message)),
    REFRESH_MS,
    [target.code, target.no]
  );

  // First bus that hasn't left yet (allow 30s for "arriving now").
  const upcoming = svc?.buses.filter((b) => Date.parse(b.eta) - now > -30_000) || [];
  const next = upcoming[0];
  const after = upcoming[1];
  const msLeft = next ? Date.parse(next.eta) - now : null;

  const label =
    msLeft === null
      ? null
      : msLeft <= 60_000
        ? `Bus ${target.no} arriving`
        : `${Math.floor(msLeft / 60000)} min · Bus ${target.no}`;
  useEffect(() => onLabel(label), [label, onLabel]);

  let big, small;
  if (svc === undefined && !error) {
    big = "…";
    small = "Checking";
  } else if (error && svc === undefined) {
    big = "–";
    small = "Couldn't reach live data";
  } else if (!next) {
    big = "–";
    small = "No estimate right now";
  } else if (msLeft <= 60_000) {
    big = "Arr";
    small = after ? `next ${clockTime(Date.parse(after.eta))}` : "last estimate";
  } else {
    big = countdown(msLeft);
    small = after ? `then ${Math.max(1, Math.floor((Date.parse(after.eta) - now) / 60000))} min` : "last estimate";
  }

  const urgency = msLeft === null ? "idle" : msLeft <= 60_000 ? "now" : msLeft <= 3 * 60_000 ? "soon" : "later";

  return (
    <div className={`toast toast-${urgency}`}>
      <span className="toast-icon">
        <PinIcon size={20} />
      </span>
      <span className="toast-text">
        <span className="toast-title">Bus {target.no}</span>
        <span className="toast-sub">{target.stopName}</span>
        {next && (
          <span className="toast-arrives">
            {/* LTA gives an exact timestamp, so this is the precise arrival time. */}
            ETA <strong>{clockTime(Date.parse(next.eta))}</strong>
          </span>
        )}
      </span>
      <span className="toast-time">
        <span className="toast-big">{big}</span>
        <span className="toast-small">{small}</span>
      </span>
      <button className="icon-btn ghost toast-close" onClick={onClose} aria-label={`Unpin bus ${target.no}`}>
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
