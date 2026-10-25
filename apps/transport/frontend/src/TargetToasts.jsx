import { useEffect, useState } from "react";
import { api, usePolling, useNow, countdown, serverNow } from "./lib.js";
import { BusIcon, TrainIcon, CloseIcon } from "./Icons.jsx";
import { shortPlatform } from "./MrtView.jsx";

const REFRESH_MS = 20_000;

// The "target bus / train" toasts stay pinned to the bottom of the screen in
// both modes until you close them. The target is saved in localStorage, so it
// survives a page reload.
export default function TargetToasts({ bus, setBus, train, setTrain }) {
  const [busLabel, setBusLabel] = useState(null);
  const [trainLabel, setTrainLabel] = useState(null);

  // Put the soonest countdown in the browser tab title, so it's visible even
  // when you switch tabs.
  useEffect(() => {
    const parts = [busLabel, trainLabel].filter(Boolean);
    document.title = parts.length ? `${parts.join(" · ")} — Transit` : "Transit — Bus & MRT";
  }, [busLabel, trainLabel]);

  if (!bus && !train) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {bus && <BusToast target={bus} onClose={() => { setBus(null); setBusLabel(null); }} onLabel={setBusLabel} />}
      {train && (
        <TrainToast target={train} onClose={() => { setTrain(null); setTrainLabel(null); }} onLabel={setTrainLabel} />
      )}
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
    msLeft === null ? null : msLeft <= 60_000 ? `Bus ${target.no} arriving` : `${Math.floor(msLeft / 60000)} min · Bus ${target.no}`;
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
    small = "Arriving now";
  } else {
    big = countdown(msLeft);
    small = after ? `next after: ${Math.max(1, Math.floor((Date.parse(after.eta) - now) / 60000))} min` : "last estimate";
  }

  return (
    <Toast
      icon={<BusIcon size={20} />}
      title={`Bus ${target.no}`}
      subtitle={target.stopName}
      big={big}
      small={small}
      urgency={urgency(msLeft)}
      onClose={onClose}
    />
  );
}

function TrainToast({ target, onClose, onLabel }) {
  const [state, setState] = useState({ platform: undefined, at: 0 });
  const [error, setError] = useState(null);
  const now = useNow(1000);

  usePolling(
    () =>
      api(`mrt/arrivals?station=${encodeURIComponent(target.station)}`)
        .then((d) => {
          setState({ platform: d.platforms.find((p) => p.id === target.platform) || null, at: serverNow() });
          setError(null);
        })
        .catch((e) => setError(e.message)),
    REFRESH_MS,
    [target.station, target.platform]
  );

  // The feed gives whole minutes at the moment we asked; count down from there.
  const p = state.platform;
  const mins = p?.next?.minutes;
  const msLeft = mins === null || mins === undefined ? null : state.at + mins * 60_000 - now;
  const dest = p?.next?.destination || target.destination;

  const label =
    msLeft === null ? null : msLeft <= 60_000 ? "Train arriving" : `${Math.round(msLeft / 60000)} min · Train`;
  useEffect(() => onLabel(label), [label, onLabel]);

  let big, small;
  if (p === undefined && !error) {
    big = "…";
    small = "Checking";
  } else if (error && p === undefined) {
    big = "–";
    small = "Couldn't reach live data";
  } else if (msLeft === null) {
    big = "–";
    small = "No estimate right now";
  } else if (msLeft <= 60_000) {
    big = "Arr";
    small = "Arriving now";
  } else {
    // The feed only gives whole minutes, so show "~N min" rather than seconds.
    big = `~${Math.round(msLeft / 60000)} min`;
    small =
      p.following?.minutes !== null && p.following?.minutes !== undefined
        ? `then ${p.following.minutes} min`
        : "last estimate";
  }

  return (
    <Toast
      icon={<TrainIcon size={20} />}
      title={dest ? `Train to ${dest}` : "Train"}
      subtitle={`${target.station} · Plat ${shortPlatform(target.platform)}`}
      big={big}
      small={small}
      urgency={urgency(msLeft)}
      onClose={onClose}
    />
  );
}

const urgency = (ms) => (ms === null ? "idle" : ms <= 60_000 ? "now" : ms <= 3 * 60_000 ? "soon" : "later");

function Toast({ icon, title, subtitle, big, small, urgency, onClose }) {
  return (
    <div className={`toast toast-${urgency}`}>
      <span className="toast-icon">{icon}</span>
      <span className="toast-text">
        <span className="toast-title">{title}</span>
        <span className="toast-sub">{subtitle}</span>
      </span>
      <span className="toast-time">
        <span className="toast-big">{big}</span>
        <span className="toast-small">{small}</span>
      </span>
      <button className="icon-btn ghost toast-close" onClick={onClose} aria-label={`Stop tracking ${title}`}>
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
