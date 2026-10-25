import "./App.css";
import { useStored } from "./lib.js";
import { BusIcon, TrainIcon } from "./Icons.jsx";
import BusView from "./BusView.jsx";
import MrtView from "./MrtView.jsx";
import TargetToasts from "./TargetToasts.jsx";

export default function App() {
  // Everything below is remembered in this browser's localStorage only.
  const [mode, setMode] = useStored("mode", "bus"); // "bus" | "mrt"
  const [savedStops, setSavedStops] = useStored("savedStops", []);
  const [savedStations, setSavedStations] = useStored("savedStations", []);
  const [targetBus, setTargetBus] = useStored("targetBus", null);
  const [targetTrain, setTargetTrain] = useStored("targetTrain", null);

  const hasToast = Boolean(targetBus || targetTrain);

  return (
    <div className={`page ${hasToast ? "has-toast" : ""}`}>
      <header className="top">
        <a className="back" href="https://xtemplate.cc">
          ← xtemplate.cc
        </a>
        <h1>Bus &amp; MRT timings.</h1>
        <p className="lede">Live arrivals across Singapore. Save stops, pick the one you're chasing.</p>

        <div className={`switch mode-${mode}`} role="tablist" aria-label="Transport mode">
          <span className="switch-thumb" aria-hidden="true" />
          <button role="tab" aria-selected={mode === "bus"} onClick={() => setMode("bus")}>
            <BusIcon /> Bus
          </button>
          <button role="tab" aria-selected={mode === "mrt"} onClick={() => setMode("mrt")}>
            <TrainIcon /> MRT
          </button>
        </div>
      </header>

      <main>
        {mode === "bus" ? (
          <BusView saved={savedStops} setSaved={setSavedStops} target={targetBus} setTarget={setTargetBus} />
        ) : (
          <MrtView saved={savedStations} setSaved={setSavedStations} target={targetTrain} setTarget={setTargetTrain} />
        )}
      </main>

      <footer className="footer">
        <span>Data: LTA DataMall &amp; SMRT. Nothing you save leaves this browser.</span>
      </footer>

      <TargetToasts bus={targetBus} setBus={setTargetBus} train={targetTrain} setTrain={setTargetTrain} />
    </div>
  );
}
