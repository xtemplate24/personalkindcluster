import "./App.css";
import { useStored } from "./lib.js";
import { SunIcon, MoonIcon, BackIcon } from "./Icons.jsx";
import BusView from "./BusView.jsx";
import PinToast from "./PinToast.jsx";

const TABS = [
  { id: "am", label: "AM", Icon: SunIcon },
  { id: "pm", label: "PM", Icon: MoonIcon },
];

export default function App() {
  // Everything below is remembered in this browser's localStorage only.
  const [tab, setTab] = useStored("tab", "am"); // "am" | "pm"
  // Two favourites lists, one per tab (AM = to work, PM = from work). Each
  // list mixes two kinds, up to MAX_FAVS of each:
  //   { type: "bus",  code, no, stopName, road, lat, lng }  one bus at one stop
  //   { type: "stop", code, name, road, lat, lng }          a whole stop
  const [favs, setAllFavs] = useStored("favs", { am: [], pm: [] });
  const [pinned, setPinned] = useStored("pinnedBus", null);

  const list = (favs && favs[tab]) || [];
  // Updates only the list of the tab that's showing.
  const setList = (fn) =>
    setAllFavs((all) => ({ ...all, [tab]: fn((all && all[tab]) || []) }));

  return (
    <div className={`page ${pinned ? "has-toast" : ""}`}>
      <header className="top">
        <a className="back" href="https://xtemplate.cc">
          <BackIcon />
          xtemplate.cc
        </a>
        <h1>Bus timings</h1>

        <div className={`switch tab-${tab}`} role="tablist" aria-label="Favourites list">
          <span className="switch-thumb" aria-hidden="true" />
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              <Icon /> {label}
            </button>
          ))}
        </div>
      </header>

      <main>
        <BusView tab={tab} favs={list} setFavs={setList} pinned={pinned} setPinned={setPinned} />
      </main>

      <footer className="footer">
        <span>Data: LTA DataMall. Nothing you save leaves this browser.</span>
      </footer>

      <PinToast pinned={pinned} setPinned={setPinned} />
    </div>
  );
}
