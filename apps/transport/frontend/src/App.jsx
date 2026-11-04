import "./App.css";
import { useStored, MAX_FAVS } from "./lib.js";
import { SunIcon, MoonIcon } from "./Icons.jsx";
import BusView from "./BusView.jsx";
import PinToast from "./PinToast.jsx";

const TABS = [
  { id: "am", label: "AM", sub: "to work", Icon: SunIcon },
  { id: "pm", label: "PM", sub: "from work", Icon: MoonIcon },
];

export default function App() {
  // Everything below is remembered in this browser's localStorage only.
  const [tab, setTab] = useStored("tab", "am"); // "am" | "pm"
  // Two favourites lists, one per tab. Each list holds up to MAX_FAVS items,
  // mixing two kinds:
  //   { type: "bus",  code, no, stopName, road, lat, lng }  one bus at one stop
  //   { type: "stop", code, name, road, lat, lng }          a whole stop
  const [favs, setAllFavs] = useStored("favs", { am: [], pm: [] });
  const [pinned, setPinned] = useStored("pinnedBus", null);

  const list = (favs && favs[tab]) || [];
  // Updates only the list of the tab that's showing.
  const setList = (fn) =>
    setAllFavs((all) => {
      const current = (all && all[tab]) || [];
      return { ...all, [tab]: fn(current).slice(0, MAX_FAVS) };
    });

  return (
    <div className={`page ${pinned ? "has-toast" : ""}`}>
      <header className="top">
        <a className="back" href="https://xtemplate.cc">
          ← xtemplate.cc
        </a>
        <h1>Bus timings</h1>
        <p className="lede">Live arrivals across Singapore. Favourite your buses for the ride to work and back.</p>

        <div className={`switch tab-${tab}`} role="tablist" aria-label="Favourites list">
          <span className="switch-thumb" aria-hidden="true" />
          {TABS.map(({ id, label, sub, Icon }) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              <span className="switch-main">
                <Icon /> {label}
              </span>
              <span className="switch-sub">{sub}</span>
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
