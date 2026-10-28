import { useEffect, useState } from "react";
import Icon from "./Icons.jsx";

const API = `${import.meta.env.BASE_URL}api`;
const DEFAULTS = ["Push ups", "Pull ups", "Crunches", "Squats"];
const DEFAULT_REST = 60;
const MAX_SETS = 5;
const COLORS = ["#67e8f9", "#6fd6c4", "#8fa8ff", "#e07a9f", "#c9d36a", "#b58cf0", "#f08a5d", "#5fc2e8"];

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
// Keep context global so it lives across component re-renders
let audioCtx = null;
let globalReverb = null;
const PITCH = 2;

// Pre-render a tiny single-channel impulse response buffer immediately on start.
// This takes 0ms computational overhead during the chime event.
function getReverbNode(ctx) {
  if (globalReverb) return globalReverb;
  try {
    const rate = ctx.sampleRate || 44100;
    const len = rate * 2.5; // Optimized to 2.5s for faster mobile memory initialization
    const buf = ctx.createBuffer(1, len, rate); // Single channel (mono) is vastly safer on Android
    const data = buf.getChannelData(0);
    
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.0);
    }
    
    const convolver = ctx.createConvolver();
    convolver.buffer = buf;
    convolver.connect(ctx.destination);
    globalReverb = convolver;
    return globalReverb;
  } catch (e) {
    console.error("Failed to build reverb graph", e);
    return null;
  }
}

function unlockAudio() {
  try {
    // Standard cross-browser AudioContext fallback assignment
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    // CRITICAL ANDROID FIX: Warm up the reverb engine immediately on the tap event thread.
    const reverb = getReverbNode(audioCtx);

    // Play a synchronous, short burst of absolute silence.
    // This primes the hardware mixer stream before the DOM switches screens.
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(0);
    osc.stop(0.02);
  } catch (e) {
    console.error("Audio hardware wake failure:", e);
  }
}

function chime() {
  // Safe hardware vibration check
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(200);
  }

  if (!audioCtx) return;

  // Final check to make sure Android hasn't suspended the pipeline in the background
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;
  const convolver = getReverbNode(audioCtx);

  // Balanced cinematic low-frequency arrangement (Db2, Ab2, Db3, F3, Ab3)
  const lowFrequencies = Array.of(69.30, 103.83, 138.59, 174.61, 207.65);

  lowFrequencies.forEach((fundamental, k) => {
    // Subtle, organic staggered entry for a premium cinematic swell feel
    const noteStartTime = now + k * 0.04;
    
    // Explicit clean harmonics to maintain standard string matrix tracking on mobile
    const harmonics = Array.of(1, 2, 3);

    harmonics.forEach((harmonicMultiplier, hIndex) => {
      try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        // Add random pitch detuning to mimic luxurious, premium analog chorus textures
        osc.detune.value = (Math.random() * 2 - 1) * 6; 
        
        // Triangle wave provides a warm, clean sub-bass layer; sines manage clear overtones
        osc.type = hIndex === 0 ? "triangle" : "sine"; 
        osc.frequency.value = fundamental * harmonicMultiplier * PITCH;

        // Dynamic volume scaling to protect small mobile device speakers from clipping distortion
        const volReduction = hIndex === 0 ? 0.3 : 0.1 / harmonicMultiplier;

        // Mobile-optimized envelope curve: snappy swell attack followed by graceful fade-out
        gainNode.gain.setValueAtTime(0.0001, noteStartTime);
        gainNode.gain.linearRampToValueAtTime(volReduction, noteStartTime + 0.06);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, noteStartTime + 2.0);

        // Path 1: Feed audio through the pre-instantiated reverb convolver
        if (convolver) {
          osc.connect(gainNode).connect(convolver);
        }
        
        // Path 2: Direct dry pipeline fallback configuration for clarity
        const dryGain = audioCtx.createGain();
        dryGain.gain.setValueAtTime(0.5, now);
        gainNode.connect(dryGain).connect(audioCtx.destination);

        // Execute node runtime bounds and register automatic garbage collection
        osc.start(noteStartTime);
        osc.stop(noteStartTime + 2.2);
      } catch (err) {
        console.error("Oscillator initialization error:", err);
      }
    });
  });
}


// "#67e8f9" -> "103, 232, 249" so CSS can do rgba(var(--tint), 0.3)
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};
const ACCENT = "103, 232, 249";
const TEAL = "111, 214, 196";
const VIOLET = "181, 140, 240";
const AMBER = "242, 166, 90";

// One clickable glass tile: round icon on the left, name + small line under it
function Tile({ icon, name, sub, tint = ACCENT, i = 0, onClick, disabled }) {
  return (
    <button className="tile" style={{ "--tint": tint, "--i": i }} onClick={onClick} disabled={disabled}>
      <span className="tile-icon"><Icon name={icon} /></span>
      <span className="tile-text">
        <span className="tile-name">{name}</span>
        {sub && <span className="tile-sub">{sub}</span>}
      </span>
    </button>
  );
}

// Four phone-style signal bars. Filled bars take the exercise colour, the rest stay grey.
function SignalBars({ bars }) {
  const heights = [4, 7, 10, 14];
  return (
    <svg className="signal" viewBox="0 0 20 16" role="img" aria-label={`${bars} of 4 bars`}>
      {heights.map((h, k) => (
        <rect key={k} className={k < bars ? "on" : "off"} x={1 + k * 5} y={15 - h} width="3" height={h} rx="1" />
      ))}
    </svg>
  );
}

// Exercise tile on the home screen: signal bars instead of an icon circle.
// "least" marks the exercise done the fewest times (amber outline + amber sub line).
function SignalTile({ name, sub, tint, bars, least, i = 0, onClick }) {
  return (
    <button className={`tile signal-tile${least ? " least" : ""}`} style={{ "--tint": tint, "--i": i }} onClick={onClick}>
      <SignalBars bars={bars} />
      <span className="tile-text">
        <span className="tile-name">{name}</span>
        <span className="tile-sub">{sub}</span>
      </span>
    </button>
  );
}

// Header used inside an exercise: back pill, big title, optional badges
function SubHead({ backLabel, onBack, title, children }) {
  return (
    <header className="top">
      <button className="back" onClick={onBack}>
        <Icon name="back" />
        {backLabel}
      </button>
      <h1>{title}</h1>
      {children && <div className="badges">{children}</div>}
    </header>
  );
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

  const deleteExercise = async () => {
    await call("/exercise", { method: "DELETE", body: { exercise } });
    await refresh();
    setExercise(null);
    setScreen("home");
  };

  if (error) return <div className="page"><p className="error">{error} — try reloading.</p></div>;
  if (!data) return <div className="page"><div className="spinner" /></div>;

  const all = [...DEFAULTS, ...data.custom];
  const tintOf = (n) => rgb(COLORS[Math.max(0, all.indexOf(n)) % COLORS.length]);
  // How many sessions each exercise has (assessment + training + ad-hoc all count)
  const counts = Object.fromEntries(all.map((n) => [n, data.sessions.filter((s) => s.exercise === n).length]));
  const topCount = Math.max(0, ...Object.values(counts));
  const leastCount = Math.min(...Object.values(counts));
  // Bars are relative to the most-done exercise: it gets 4, the rest get their share (rounded up).
  // 0 sessions = 0 bars (all grey), anything logged gets at least 1.
  const barsFor = (c) => (c === 0 || topCount === 0 ? 0 : Math.max(1, Math.ceil((c / topCount) * 4)));
  // Only highlight the least-done one when there is something to compare (not all equal)
  const flagLeast = topCount > leastCount;
  const max = exercise ? latestMax(data.sessions, exercise) : null;
  const plan = exercise ? data.plans.find((p) => p.exercise === exercise) || null : null;
  const toMode = () => setScreen("mode");
  const top = screen === "home" || screen === "stats";

  return (
    <div className="page">
      {top && (
        <header className="top">
          <a className="back" href="https://xtemplate.cc">
            <Icon name="back" />
            xtemplate.cc
          </a>
          <h1>Workout</h1>
          <div className="tabs" role="tablist" aria-label="Section">
            <button role="tab" aria-selected={screen === "home"} className={`tab ${screen === "home" ? "on" : ""}`} onClick={() => setScreen("home")}>
              Exercises
            </button>
            <button role="tab" aria-selected={screen === "stats"} className={`tab ${screen === "stats" ? "on" : ""}`} onClick={() => setScreen("stats")}>
              My stats
            </button>
            <span className={`tab-pill ${screen === "stats" ? "right" : ""}`} aria-hidden="true" />
          </div>
        </header>
      )}

      <main key={screen} className="view">
        {screen === "home" && (
          <>
            <section className="plain">
              <h2 className="layer-label">Pick an exercise</h2>
              <div className="tiles">
                {all.map((n, i) => {
                  const m = latestMax(data.sessions, n);
                  const c = counts[n];
                  const s = c === 0 ? "not started" : `${c} session${c === 1 ? "" : "s"}`;
                  return (
                    <SignalTile key={n} i={i} name={n} tint={tintOf(n)} bars={barsFor(c)} least={flagLeast && c === leastCount}
                      sub={m === null ? s : `${s} · max ${m}`}
                      onClick={() => { setExercise(n); setScreen("mode"); }} />
                  );
                })}
              </div>
            </section>

            <section className="plain">
              <h2 className="layer-label">Add a custom exercise</h2>
              <div className="row">
                <input value={newName} maxLength={30} placeholder="e.g. Burpees" aria-label="Custom exercise name" onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustom()} />
                <button className="primary" onClick={addCustom}>Add</button>
              </div>
            </section>
          </>
        )}

        {screen === "mode" && (
          <>
            <SubHead backLabel="Exercises" onBack={() => setScreen("home")} title={exercise}>
              <span className="badge" style={{ "--tint": tintOf(exercise) }}>
                {max === null ? "no assessment yet" : `max ${max} reps`}
              </span>
              <span className="badge badge-mono">
                {plan ? `plan: ${plan.sets} set${plan.sets > 1 ? "s" : ""} · rest ${fmt(plan.rest)}` : "no training plan"}
              </span>
            </SubHead>

            <section className="layer">
              <h2 className="layer-label">Choose a mode</h2>
              <div className="tiles modes">
                <Tile i={0} icon="target" name="Assessment" sub="3, 2, 1, then max reps" onClick={() => setScreen("assess")} />
                <Tile i={1} icon="repeat" name="Daily training" tint={TEAL}
                  sub={plan ? "follows your plan" : max !== null ? "recommended from your max" : "needs a plan or an assessment"}
                  disabled={!plan && max === null} onClick={() => setScreen("train")} />
                <Tile i={2} icon="plus" name="Ad-hoc" tint={VIOLET} sub="log extra reps" onClick={() => setScreen("adhoc")} />
              </div>
            </section>

            <button className="pill-btn" onClick={() => setScreen("plan")}>
              <Icon name="list" />
              {plan ? "Change training plan" : "Set training plan"}
            </button>
          </>
        )}

        {screen === "assess" && <Assessment exercise={exercise} onSave={save} onBack={toMode} />}
        {screen === "train" && <Training exercise={exercise} max={max} plan={plan} onSave={save} onBack={toMode} />}
        {screen === "adhoc" && <AdHoc exercise={exercise} onSave={save} onBack={toMode} />}
        {screen === "plan" && <PlanEditor exercise={exercise} plan={plan} max={max} onSave={savePlan} onDeleteExercise={deleteExercise} onBack={toMode} />}
        {screen === "stats" && <Stats sessions={data.sessions} custom={data.custom} onDelete={deleteAll} />}
      </main>
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

function PlanEditor({ exercise, plan, max, onSave, onBack, onDeleteExercise }) {
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
    <>
      <SubHead backLabel={exercise} onBack={onBack} title="Training plan" />

      <section className="layer dashed">
        <h2 className="layer-label">Recommendation</h2>
        {rec ? (
          <>
            <p className="muted small">From your max of {max} reps</p>
            <p className="reco-sets">{rec.join(" · ")}</p>
            <label>x (extra reps on sets 2 and 5)</label>
            <Stepper value={x} onChange={setX} min={0} max={50} />
            <button className="btn" onClick={() => { setSets(5); setReps(rec.map(String)); }}>Use recommended</button>
          </>
        ) : (
          <p className="muted small">No recommendation yet. Do an assessment for this exercise first.</p>
        )}
      </section>

      <section className="layer">
        <h2 className="layer-label">Your plan</h2>
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
      </section>

      <button className="primary huge" disabled={!valid || busy} onClick={submit}>Save plan</button>
      {err && <p className="error">{err}</p>}
      <DeleteExercise exercise={exercise} onDelete={onDeleteExercise} />
    </>
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
    <>
      <SubHead backLabel={exercise} onBack={onBack} title="Assessment">
        <span className="badge">max reps test</span>
      </SubHead>
      <section className="layer stage">
        {count === null && <p className="muted center">A 3-second countdown, then do as many reps as you can.</p>}
        {count > 0 && <div key={count} className="clock pop">{count}</div>}
        {count === 0 && (
          <>
            <div className="clock go pop">GO</div>
            <p className="muted center">Do as many reps as you can, then log it.</p>
            <div className="row">
              <input type="number" min="0" autoFocus value={reps} placeholder="Max reps" onChange={(e) => setReps(e.target.value)} />
              <button className="primary" onClick={submit}>Save</button>
            </div>
          </>
        )}
        {err && <p className="error">{err}</p>}
      </section>
      {count === null && <button className="primary huge" onClick={() => { unlockAudio(); setCount(3); }}>Start</button>}
    </>
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
    <>
      <SubHead backLabel={phase === "setup" ? exercise : "Quit (not saved)"} onBack={onBack} title="Daily training">
        <span className="badge" style={{ "--tint": TEAL }}>{plan.length} sets</span>
        <span className="badge badge-mono">rest {fmt(restSecs)}</span>
      </SubHead>

      {phase !== "setup" && (
        <div className="dots">
          {plan.map((_, k) => (
            <span key={k} className={k < i || (k === i && phase === "effort") ? "dot done" : k === i ? "dot now" : "dot"} />
          ))}
        </div>
      )}

      {phase === "setup" && (
        <>
          <section className="layer">
            <h2 className="layer-label">{saved ? "Your plan" : "Recommended from your max"}</h2>
            <p className="reco-sets">{plan.join(" · ")}</p>
            {!saved && (
              <>
                <p className="muted small">No saved plan, so this uses your max of {max}.</p>
                <label>Your x (extra reps on sets 2 and 5)</label>
                <input type="number" min="0" value={x} onChange={(e) => setX(e.target.value)} />
              </>
            )}
          </section>
          <button className="primary huge" onClick={() => { unlockAudio(); setPhase("set"); }}>Begin</button>
        </>
      )}

      {phase === "set" && (
        <>
          <section className="layer stage">
            <h2 className="layer-label center">Set {i + 1} of {plan.length}</h2>
            <div key={i} className="clock pop">{plan[i]}</div>
            <p className="muted center">reps</p>
          </section>
          <button className="primary huge" onClick={finishSet}>Set done</button>
        </>
      )}

      {phase === "rest" && (
        <section className="layer stage">
          <h2 className="layer-label center">Rest · next: set {i + 2} ({plan[i + 1]} reps)</h2>
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
            <button className="btn" onClick={() => { setLeft((l) => l + 10); setTotal((t) => t + 10); }}>+10s</button>
            <button className="primary" onClick={nextSet}>Skip rest</button>
          </div>
        </section>
      )}

      {phase === "effort" && (
        <section className="layer stage">
          <h2 className="layer-label center">Done! How hard was it?</h2>
          <p className="muted center small">1 easy – 5 max effort</p>
          <div className="efforts">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className="effort" onClick={() => submit(n)}>{n}</button>
            ))}
          </div>
        </section>
      )}
      {err && <p className="error">{err}</p>}
    </>
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
    <>
      <SubHead backLabel={exercise} onBack={onBack} title="Ad-hoc">
        <span className="badge" style={{ "--tint": VIOLET }}>extra reps</span>
      </SubHead>
      <section className="layer">
        <h2 className="layer-label">Log reps done outside your normal training</h2>
        <label>Reps</label>
        <input type="number" min="1" autoFocus value={reps} placeholder="e.g. 15" onChange={(e) => setReps(e.target.value)} />
        <label>Effort (1 easy – 5 max effort)</label>
        <div className="efforts">
          {[1, 2, 3, 4, 5].map((k) => (
            <button key={k} className={effort === k ? "effort sel" : "effort"} aria-pressed={effort === k} onClick={() => setEffort(k)}>{k}</button>
          ))}
        </div>
      </section>
      <button className="primary huge" disabled={!(n > 0) || !effort || busy} onClick={submit}>Save</button>
      {err && <p className="error">{err}</p>}
    </>
  );
}

function Stats({ sessions, custom, onDelete }) {
  const [filter, setFilter] = useState("All");

  const allNames = [...new Set([...DEFAULTS, ...custom, ...sessions.map((s) => s.exercise)])];
  const names = allNames.filter((n) => sessions.some((s) => s.exercise === n));
  const colorOf = (n) => COLORS[allNames.indexOf(n) % COLORS.length];

  if (!sessions.length && !custom.length)
    return <section className="layer dashed"><p className="muted center">Nothing logged yet. Pick an exercise to get started.</p></section>;

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
    <>
      <div className="cards">
        <div className="card" style={{ "--tint": ACCENT }}><b>{daysActive}</b><span>days active</span></div>
        <div className="card" style={{ "--tint": TEAL }}><b>{sessions.length}</b><span>sessions</span></div>
        <div className="card" style={{ "--tint": AMBER }}><b>{avgEffort}</b><span>avg effort</span></div>
      </div>

      <section className="layer">
        <h2 className="layer-label">Last 14 days</h2>
        <div className="chips">
          {["All", ...names].map((n) => (
            <button key={n} className={filter === n ? "chip on" : "chip"} aria-pressed={filter === n}
              style={{ "--tint": n === "All" ? ACCENT : rgb(colorOf(n)) }} onClick={() => setFilter(n)}>
              <span className="chip-dot" />
              {n}
            </button>
          ))}
        </div>
        <Chart
          key={filter}
          sessions={filter === "All" ? sessions : sessions.filter((s) => s.exercise === filter)}
          names={filter === "All" ? names : [filter]}
          colorOf={colorOf}
        />
      </section>

      <section className="layer">
        <h2 className="layer-label">By exercise</h2>
        {rows.map((r) => (
          <div key={r.n} className="hbar">
            <div className="hbar-label"><span>{r.n}</span><span>max {r.max ?? "–"} · total {r.total}</span></div>
            <div className="track"><div className="fill" style={{ width: `${(r.total / tmax) * 100}%`, background: colorOf(r.n) }} /></div>
          </div>
        ))}
      </section>

      <DeleteAll onDelete={onDelete} />
    </>
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
        <button className="danger-btn" onClick={() => setOpen(true)}><Icon name="trash" />Delete all data</button>
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
          <button className="btn" onClick={() => { setOpen(false); setText(""); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function DeleteExercise({ exercise, onDelete }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const go = async () => {
    setBusy(true);
    try { await onDelete(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="danger">
      {!open ? (
        <button className="danger-btn" onClick={() => setOpen(true)}><Icon name="trash" />Delete exercise</button>
      ) : (
        <div className="danger-box">
          <p>This permanently deletes every session, max, training plan, and ad-hoc log for "{exercise}". It can't be undone.</p>
          <label>Type DELETE to confirm</label>
          <div className="row">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" />
            <button className="danger-btn solid" disabled={text !== "DELETE" || busy} onClick={go}>
              {busy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
          {err && <p className="error">{err}</p>}
          <button className="btn" onClick={() => { setOpen(false); setText(""); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}