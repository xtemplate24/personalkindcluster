import { useEffect, useState } from "react";

const API = `${import.meta.env.BASE_URL}api`;
const DEFAULTS = ["Push ups", "Pull ups", "Crunches", "Squats"];
const DEFAULT_REST = 60;
const MAX_SETS = 5;
const COLORS = ["#f2a65a", "#6fd6c4", "#8fa8ff", "#e07a9f", "#c9d36a", "#b58cf0", "#f08a5d", "#5fc2e8"];

async function call(path, { method, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
  return res.json();
}

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const latestMax = (sessions, ex) => {
  const a = sessions.filter((s) => s.exercise === ex && s.kind === "assessment");
  return a.length ? a[a.length - 1].reps : null;
};
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
// Recommended 5-set pattern: n/2, n/2+x, n/2, n/2, n/2+x
const recommend = (max, x) => {
  const h = Math.floor(max / 2);
  return [h, h + x, h, h, h + x];
};

// Browsers only allow sound after a tap, so unlockAudio() is called from button clicks.
let audioCtx;
function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
function chime() {
  navigator.vibrate?.(200);
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  [659.25, 783.99, 1046.5].forEach((freq, k) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const t = now + k * 0.18;
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 1.3);
  });
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [screen, setScreen] = useState("home"); // home | mode | assess | train | adhoc | plan | stats
  const [exercise, setExercise] = useState(null);
  const [newName, setNewName] = useState("");

  const refresh = () => call("/state").then(setData).catch((e) => setError(e.message));
  useEffect(() => { refresh(); }, []);

  const save = async (session) => {
    await call("/sessions", { body: { exercise, ...session } });
    await refresh();
    setScreen("mode");
  };

  const savePlan = async (plan) => {
    await call("/plans", { body: { exercise, ...plan } });
    await refresh();
    setScreen("mode");
  };

  const addCustom = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await call("/custom", { body: { name } });
      await refresh();
      setNewName("");
      setExercise(name);
      setScreen("mode");
    } catch (e) { setError(e.message); }
  };

  const deleteAll = async () => {
    await call("/data", { method: "DELETE" });
    await refresh();
  };

  if (error) return <div className="page"><p className="error">{error} — try reloading.</p></div>;
  if (!data) return <div className="page"><div className="spinner" /></div>;

  const max = exercise ? latestMax(data.sessions, exercise) : null;
  const plan = exercise ? data.plans.find((p) => p.exercise === exercise) || null : null;

  return (
    <div className="page">
      <nav className="nav">
        <button className={screen !== "stats" ? "tab on" : "tab"} onClick={() => setScreen("home")}>Exercises</button>
        <button className={screen === "stats" ? "tab on" : "tab"} onClick={() => setScreen("stats")}>My stats</button>
      </nav>

      <div key={screen} className="screen">
        {screen === "home" && (
          <section>
            <h1>Pick an exercise</h1>
            <div className="grid">
              {[...DEFAULTS, ...data.custom].map((n, i) => (
                <button key={n} style={{ "--i": i }} className="big" onClick={() => { setExercise(n); setScreen("mode"); }}>{n}</button>
              ))}
            </div>
            <h2>Custom</h2>
            <div className="row">
              <input value={newName} maxLength={30} placeholder="e.g. Burpees" onChange={(e) => setNewName(e.target.value)} />
              <button className="primary" onClick={addCustom}>Add</button>
            </div>
          </section>
        )}

        {screen === "mode" && (
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" ,marginTop: "2rem"}}>
              <h1 style={{ margin: 0 }}>{exercise}</h1>
              <button 
                className="secondary-btn" /* Feel free to swap with an existing small button class */
                onClick={() => setScreen("plan")}
                style={{ padding: "0.5rem 1rem", cursor: "pointer" }}
              >
                {plan ? "Change plan" : "Set training plan"}
              </button>
            </div>
            <p className="muted">
              {max === null ? "No assessment yet." : `Current max: ${max} reps`}
              {" · "}
              {plan ? `Plan: ${plan.sets} set${plan.sets > 1 ? "s" : ""}, rest ${fmt(plan.rest)}` : "No training plan set."}
            </p>
            <div className="grid">
              <button style={{ "--i": 0 }} className="big" onClick={() => setScreen("assess")}>Assessment</button>
              <button style={{ "--i": 1 }} className="big" disabled={!plan && max === null} onClick={() => setScreen("train")}>Daily training</button>
              <button style={{ "--i": 3 }} className="big" onClick={() => setScreen("adhoc")}>Ad-hoc</button>
            </div>
            {!plan && max === null && <p className="muted">Set a training plan or do an assessment to unlock daily training.</p>}
          </section>
        )}

        {screen === "assess" && <Assessment exercise={exercise} onSave={save} onBack={() => setScreen("mode")} />}
        {screen === "train" && <Training exercise={exercise} max={max} plan={plan} onSave={save} onBack={() => setScreen("mode")} />}
        {screen === "adhoc" && <AdHoc exercise={exercise} onSave={save} onBack={() => setScreen("mode")} />}
        {screen === "plan" && <PlanEditor exercise={exercise} plan={plan} max={max} onSave={savePlan} onBack={() => setScreen("mode")} />}
        {screen === "stats" && <Stats sessions={data.sessions} custom={data.custom} onDelete={deleteAll} />}
      </div>
    </div>
  );
}

function Stepper({ value, onChange, min, max, step = 1, display }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label="decrease">−</button>
      <b>{display ? display(value) : value}</b>
      <button onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max} aria-label="increase">+</button>
    </div>
  );
}

function PlanEditor({ exercise, plan, max, onSave, onBack }) {
  const [sets, setSets] = useState(plan?.sets ?? 3);
  const [reps, setReps] = useState(() => {
    const r = (plan?.reps ?? []).map(String);
    while (r.length < MAX_SETS) r.push(r.length ? r[r.length - 1] : "10");
    return r;
  });
  const [rest, setRest] = useState(plan?.rest ?? DEFAULT_REST);
  const [x, setX] = useState(2);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const rec = max === null ? null : recommend(max, x);
  const valid = reps.slice(0, sets).every((v) => parseInt(v, 10) > 0);

  const submit = () => {
    setBusy(true);
    onSave({ sets, reps: reps.slice(0, sets).map((v) => parseInt(v, 10)), rest })
      .catch((e) => { setErr(e.message); setBusy(false); });
  };

  return (
    <section>
      <h1>{exercise} — training plan</h1>

      <div className="reco">
        {rec ? (
          <>
            <p className="muted" style={{ margin: 0 }}>Recommended (from your max of {max})</p>
            <p className="reco-sets">{rec.join(" · ")}</p>
            <label style={{ marginTop: 0 }}>x (extra reps on sets 2 and 5)</label>
            <Stepper value={x} onChange={setX} min={0} max={50} />
            <button className="primary" style={{ marginTop: 12 }} onClick={() => { setSets(5); setReps(rec.map(String)); }}>
              Use recommended
            </button>
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No recommendation yet — you haven't done an assessment for this exercise.
          </p>
        )}
      </div>

      <label>Number of sets (1–{MAX_SETS})</label>
      <Stepper value={sets} onChange={setSets} min={1} max={MAX_SETS} />

      <label>Reps per set</label>
      {reps.slice(0, sets).map((v, k) => (
        <div key={k} className="setrow">
          <span>Set {k + 1}</span>
          <input type="number" min="1" value={v} onChange={(e) => setReps(reps.map((o, j) => (j === k ? e.target.value : o)))} />
        </div>
      ))}

      <label>Rest between sets</label>
      <Stepper value={rest} onChange={setRest} min={10} max={600} step={10} display={fmt} />

      <button className="primary huge" disabled={!valid || busy} onClick={submit}>Save plan</button>
      {err && <p className="error">{err}</p>}
      <button className="secondary-btn"  style={{ marginTop: 10 }} onClick={onBack}>Back</button>
    </section>
  );
}

function Assessment({ exercise, onSave, onBack }) {
  const [count, setCount] = useState(null); // null = not started, 3..1 counting, 0 = go
  const [reps, setReps] = useState("");
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (count === null) return;
    if (count === 0) { chime(); return; }
    const t = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  const submit = () => {
    const n = parseInt(reps, 10);
    if (!(n >= 0)) return setErr("Enter a number of reps");
    onSave({ kind: "assessment", reps: n, effort: null }).catch((e) => setErr(e.message));
  };

  return (
    <section>
      <h1>{exercise} — assessment</h1>
      {count === null && <button className="primary huge" onClick={() => { unlockAudio(); setCount(3); }}>Start</button>}
      {count > 0 && <div key={count} className="clock pop">{count}</div>}
      {count === 0 && (
        <>
          <div className="clock go pop">GO!</div>
          <p className="muted center">Do as many reps as you can, then log it.</p>
          <div className="row">
            <input type="number" min="0" autoFocus value={reps} placeholder="Max reps" onChange={(e) => setReps(e.target.value)} />
            <button className="primary" onClick={submit}>Save</button>
          </div>
        </>
      )}
      {err && <p className="error">{err}</p>}
      <button className="secondary-btn"  style={{ marginTop: 10 }} onClick={onBack}>Back</button>
    </section>
  );
}

function Training({ exercise, max, plan: saved, onSave, onBack }) {
  // A saved plan wins. Without one we fall back to the recommended pattern from the max.
  const [x, setX] = useState("2");
  const [phase, setPhase] = useState("setup"); // setup | set | rest | effort
  const [i, setI] = useState(0);
  const restSecs = saved ? saved.rest : DEFAULT_REST;
  const [left, setLeft] = useState(restSecs);
  const [total, setTotal] = useState(restSecs);
  const [err, setErr] = useState(null);

  const xn = Math.max(0, parseInt(x, 10) || 0);
  const plan = saved ? saved.reps : recommend(max, xn);

  const nextSet = () => { setI(i + 1); setPhase("set"); };

  useEffect(() => {
    if (phase !== "rest") return;
    if (left <= 0) { chime(); return nextSet(); }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left]);

  const finishSet = () => {
    unlockAudio();
    if (i === plan.length - 1) return setPhase("effort");
    setLeft(restSecs);
    setTotal(restSecs);
    setPhase("rest");
  };

  const submit = (effort) =>
    onSave({ kind: "training", reps: plan.reduce((a, b) => a + b, 0), effort }).catch((e) => setErr(e.message));

  const C = 2 * Math.PI * 60;

  return (
    <section>
      <h1>{exercise} — training</h1>
      {phase !== "setup" && (
        <div className="dots">
          {plan.map((_, k) => (
            <span key={k} className={k < i || (k === i && phase === "effort") ? "dot done" : k === i ? "dot now" : "dot"} />
          ))}
        </div>
      )}
      {phase === "setup" && (
        <>
          {saved ? (
            <p className="muted">Your plan: {plan.join(", ")} reps · rest {fmt(restSecs)}</p>
          ) : (
            <>
              <p className="muted">No saved plan — using the recommended pattern from your max of {max}: {plan.join(", ")}</p>
              <label>Your x (extra reps on sets 2 and 5)</label>
              <input type="number" min="0" value={x} onChange={(e) => setX(e.target.value)} style={{ marginTop: 8 }} />
            </>
          )}
          <button className="primary huge" onClick={() => { unlockAudio(); setPhase("set"); }}>Begin</button>
        </>
      )}
      {phase === "set" && (
        <>
          <p className="muted center">Set {i + 1} of {plan.length}</p>
          <div key={i} className="clock pop">{plan[i]}</div>
          <p className="muted center">reps</p>
          <button className="primary huge" onClick={finishSet}>Set done</button>
        </>
      )}
      {phase === "rest" && (
        <>
          <p className="muted center">Rest — next: set {i + 2} ({plan[i + 1]} reps)</p>
          <div className="ring">
            <svg viewBox="0 0 140 140">
              <circle className="ring-bg" cx="70" cy="70" r="60" />
              <circle
                className="ring-fg" cx="70" cy="70" r="60"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - Math.min(1, left / total))}
              />
            </svg>
            <div className="ring-time">{fmt(left)}</div>
          </div>
          <div className="row">
            <button onClick={() => { setLeft((l) => l + 10); setTotal((t) => t + 10); }}>+10s</button>
            <button className="primary" onClick={nextSet}>Skip rest</button>
          </div>
        </>
      )}
      {phase === "effort" && (
        <>
          <p className="muted center">Done! How hard was it? (1 easy – 5 max effort)</p>
          <div className="row">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="big" onClick={() => submit(n)}>{n}</button>
            ))}
          </div>
        </>
      )}
      {err && <p className="error">{err}</p>}
      {phase !== "effort" && <button className="secondary-btn"  style={{ marginTop: 10 }} onClick={onBack}>Quit (this session is not saved)</button>}
    </section>
  );
}

function AdHoc({ exercise, onSave, onBack }) {
  const [reps, setReps] = useState("");
  const [effort, setEffort] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const n = parseInt(reps, 10);

  const submit = () => {
    setBusy(true);
    onSave({ kind: "adhoc", reps: n, effort }).catch((e) => { setErr(e.message); setBusy(false); });
  };

  return (
    <section>
      <h1>{exercise} — ad-hoc</h1>
      <p className="muted">Log extra reps done outside your normal training.</p>
      <label>Reps</label>
      <div className="row">
        <input type="number" min="1" autoFocus value={reps} placeholder="e.g. 15" onChange={(e) => setReps(e.target.value)} />
      </div>
      <label>Effort (1 easy – 5 max effort)</label>
      <div className="row">
        {[1, 2, 3, 4, 5].map((k) => (
          <button key={k} className={effort === k ? "big sel" : "big"} onClick={() => setEffort(k)}>{k}</button>
        ))}
      </div>
      <button className="primary huge" disabled={!(n > 0) || !effort || busy} onClick={submit}>Save</button>
      {err && <p className="error">{err}</p>}
      <button className="secondary-btn"  style={{ marginTop: 10 }} onClick={onBack}>Back</button>
    </section>
  );
}

function Stats({ sessions, custom, onDelete }) {
  const [filter, setFilter] = useState("All");

  const allNames = [...new Set([...DEFAULTS, ...custom, ...sessions.map((s) => s.exercise)])];
  const names = allNames.filter((n) => sessions.some((s) => s.exercise === n));
  const colorOf = (n) => COLORS[allNames.indexOf(n) % COLORS.length];

  if (!sessions.length && !custom.length)
    return <section><h1>My stats</h1><p className="muted">Nothing logged yet.</p></section>;

  // A Set only keeps unique values, so each calendar day is counted once
  const daysActive = new Set(sessions.map((s) => dayKey(s.ts))).size;
  const efforts = sessions.filter((s) => s.effort);
  const avgEffort = efforts.length ? (efforts.reduce((a, s) => a + s.effort, 0) / efforts.length).toFixed(1) : "–";
  const rows = names.map((n) => ({
    n,
    max: latestMax(sessions, n),
    total: sessions.filter((s) => s.exercise === n).reduce((a, s) => a + s.reps, 0),
  }));
  const tmax = Math.max(1, ...rows.map((r) => r.total));

  return (
    <section>
      <h1>My stats</h1>
      <div className="cards">
        <div className="card"><b>{daysActive}</b><span>days active</span></div>
        <div className="card"><b>{sessions.length}</b><span>sessions</span></div>
        <div className="card"><b>{avgEffort}</b><span>avg effort</span></div>
      </div>

      <h2>Last 14 days</h2>
      <div className="chips">
        {["All", ...names].map((n) => (
          <button key={n} className={filter === n ? "chip on" : "chip"} onClick={() => setFilter(n)}>{n}</button>
        ))}
      </div>
      <Chart
        key={filter}
        sessions={filter === "All" ? sessions : sessions.filter((s) => s.exercise === filter)}
        names={filter === "All" ? names : [filter]}
        colorOf={colorOf}
      />

      <h2>By exercise</h2>
      {rows.map((r) => (
        <div key={r.n} className="hbar">
          <div className="hbar-label"><span>{r.n}</span><span>max {r.max ?? "–"} · total {r.total}</span></div>
          <div className="track"><div className="fill" style={{ width: `${(r.total / tmax) * 100}%`, background: colorOf(r.n) }} /></div>
        </div>
      ))}



      <DeleteAll onDelete={onDelete} />
    </section>
  );
}

function Chart({ sessions, names, colorOf }) {
  const W = 560, H = 250, L = 38, R = 30, T = 14, B = 26;
  const pw = W - L - R, ph = H - T - B, slot = pw / 14, bw = slot * 0.62;

  const days = [];
  for (let k = 13; k >= 0; k--) {
    const d = new Date();
    d.setDate(d.getDate() - k);
    days.push({ key: dayKey(d), label: d.getDate(), by: {}, total: 0, eff: [] });
  }
  sessions.forEach((s) => {
    const d = days.find((x) => x.key === dayKey(s.ts));
    if (!d) return;
    d.by[s.exercise] = (d.by[s.exercise] || 0) + s.reps;
    d.total += s.reps;
    if (s.effort) d.eff.push(s.effort);
  });

  const top = Math.max(10, Math.ceil(Math.max(...days.map((d) => d.total)) / 10) * 10);
  const yReps = (v) => T + ph - (v / top) * ph;
  const yEff = (e) => T + ph - ((e - 1) / 4) * ph;
  const xMid = (i) => L + i * slot + slot / 2;

  const pts = days
    .map((d, i) => (d.eff.length ? { i, e: d.eff.reduce((a, b) => a + b, 0) / d.eff.length } : null))
    .filter(Boolean);
  const path = pts.map((p, k) => `${k ? "L" : "M"}${xMid(p.i)},${yEff(p.e)}`).join(" ");

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Reps per day by exercise with average effort">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="grid-line" x1={L} x2={W - R} y1={yReps(top * f)} y2={yReps(top * f)} />
            <text className="axis" x={W - R + 6} y={yReps(top * f) + 3} textAnchor="start">{Math.round(top * f)}</text>
          </g>
        ))}
        {[1, 2, 3, 4, 5].map((e) => (
          <text key={e} className="axis eff" x={L - 6} y={yEff(e) + 3} textAnchor="end">{e}</text>
        ))}

        {days.map((d, i) => {
          let acc = 0;
          return names.map((n) => {
            const v = d.by[n] || 0;
            if (!v) return null;
            const h = (v / top) * ph;
            const y = T + ph - acc - h;
            acc += h;
            return (
              <rect key={`${d.key}-${n}`} className="bar" style={{ animationDelay: `${i * 30}ms` }}
                x={L + i * slot + (slot - bw) / 2} y={y} width={bw} height={h} rx="2" fill={colorOf(n)}>
                <title>{`${d.label}: ${n} ${v} reps`}</title>
              </rect>
            );
          });
        })}

        {days.map((d, i) => (
          <text key={d.key} className="axis" x={xMid(i)} y={H - 8} textAnchor="middle">{d.label}</text>
        ))}

        {pts.length > 1 && <path className="line" d={path} pathLength="1" />}
        {pts.map((p) => (
          <circle key={p.i} className="pt" cx={xMid(p.i)} cy={yEff(p.e)} r="4">
            <title>{`Avg effort ${p.e.toFixed(1)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="legend">
        {names.map((n) => (
          <span key={n}><i style={{ background: colorOf(n) }} />{n}</span>
        ))}
        <span><i className="swatch-line" />Avg effort (left axis, 1–5)</span>
      </div>
    </div>
  );
}

function DeleteAll({ onDelete }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const go = async () => {
    setBusy(true);
    try { await onDelete(); setOpen(false); setText(""); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="danger">
      {!open ? (
        <button className="danger-btn" onClick={() => setOpen(true)}>Delete all data</button>
      ) : (
        <div className="danger-box">
          <p>This permanently deletes every session, max, training plan, and custom exercise. It can't be undone.</p>
          <label>Type DELETE to confirm</label>
          <div className="row">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" />
            <button className="danger-btn solid" disabled={text !== "DELETE" || busy} onClick={go}>
              {busy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
          {err && <p className="error">{err}</p>}
          <button className="secondary-btn"  style={{ marginTop: 10 }} onClick={() => { setOpen(false); setText(""); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}