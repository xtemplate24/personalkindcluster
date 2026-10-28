import "./App.css";
import { useEffect, useState, useRef } from "react";

// Each app: name, link, which icon to draw, and a glow colour (r, g, b).
const pub_apps = [
  { name: "Currency Converter", url: "https://app1.xtemplate.cc", icon: "currency", tint: "103, 232, 249" },
  { name: "Bus & MRT", url: "https://transport.xtemplate.cc", icon: "bus", tint: "242, 166, 90" },
  { name: "Architecture", url: "https://architecture.xtemplate.cc", icon: "diagram", tint: "111, 214, 196" },
];

const priv_apps = [
  { name: "Local LLM", url: "https://app2.xtemplate.cc", icon: "chat", tint: "181, 140, 240" },
  { name: "Workout", url: "https://workout.xtemplate.cc", icon: "dumbbell", tint: "111, 214, 196" },
  { name: "Notes", url: "https://notes.xtemplate.cc", icon: "notes", tint: "143, 168, 255" },
];

// Simple line icons (24x24), drawn in the app's glow colour.
const icons = {
  currency: (
    <>
      <path d="M4 8h14M14 4l4 4-4 4" />
      <path d="M20 16H6M10 12l-4 4 4 4" />
    </>
  ),
  bus: (
    <>
      <rect x="5" y="3" width="14" height="15" rx="3" />
      <path d="M5 11h14M8 18v2.5M16 18v2.5" />
      <circle cx="8.5" cy="14.5" r="0.9" fill="currentColor" />
      <circle cx="15.5" cy="14.5" r="0.9" fill="currentColor" />
    </>
  ),
  chat: (
    <>
      <path d="M20.5 12a8 8 0 0 1-11.7 7.1L4 20l1-4.4A8 8 0 1 1 20.5 12z" />
      <circle cx="8.5" cy="12" r="0.9" fill="currentColor" />
      <circle cx="12.25" cy="12" r="0.9" fill="currentColor" />
      <circle cx="16" cy="12" r="0.9" fill="currentColor" />
    </>
  ),
  diagram: (
    <>
      <rect x="9" y="3" width="6" height="5" rx="1.5" />
      <rect x="3" y="16" width="6" height="5" rx="1.5" />
      <rect x="15" y="16" width="6" height="5" rx="1.5" />
      <path d="M12 8v4M6 16v-4h12v4" />
    </>
  ),
  dumbbell: <path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" />,
  notes: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
};

// One round app tile: glass circle with the icon, name underneath.
function AppIcon({ app, i }) {
  return (
    <a href={app.url} className="app-tile" style={{ "--i": i, "--tint": app.tint }}>
      <span className="app-circle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {icons[app.icon]}
        </svg>
      </span>
      <span className="app-name">{app.name}</span>
    </a>
  );
}

const admin_links = [
  { name: "Console", url: "https://console.xtemplate.cc" },
  { name: "Argo CD", url: "https://argocd.xtemplate.cc" },
  { name: "Grafana", url: "https://grafana.xtemplate.cc" },
];

export default function App() {

  const [menuOpen, setMenuOpen] = useState(false);  // is the menu expanded?
  const menuRef = useRef(null);                     // points at the menu, to detect clicks outside it

  // close the menu when clicking outside it, or pressing Esc
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const [user, setUser] = useState(null); // null = checking, string = signed in, false = not

  useEffect(() => {
  fetch("/oauth2/auth", { credentials: "include" })
    .then((res) =>
      setUser(res.ok ? res.headers.get("X-Auth-Request-User") || "signed in" : false)
    )
    .catch(() => setUser(false));
}, []);

  return (
    <div className="page">
      {user && (
        <div className={`menu ${menuOpen ? "open" : ""}`} ref={menuRef}>
          <button
            className="menu-btn"
            aria-label="Admin menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className="bar" />
            <span className="bar" />
            <span className="bar" />
          </button>

          <nav className="menu-panel" aria-label="Admin">
            <span className="menu-title">Platform Admin</span>
            {admin_links.map((link, i) => (
              <a key={link.url} href={link.url} className="menu-link" style={{ "--i": i }}>
                {link.name}
                <span className="menu-arrow">→</span>
              </a>
            ))}
          </nav>
        </div>
      )}

      <div className="hero">
        <div className="hero-copy">
          <h1>Welcome to my Homelab</h1>
          <p className="lede">
            Private apps secured with OAuth <br></br> Single-node K3s cluster | HP EliteDesk
          </p>

          <p className="sub">
            Public Apps
          </p>

          <nav className="apps" aria-label="Public apps">
            {pub_apps.map((app, i) => <AppIcon key={app.url} app={app} i={i} />)}
          </nav>

          <p className="sub">
            Private Apps
          </p>

          <nav className="apps" aria-label="Private apps">
            {priv_apps.map((app, i) => <AppIcon key={app.url} app={app} i={i + pub_apps.length} />)}
          </nav>
        </div>

        <aside className="status" aria-label="Cluster status">
          <div className="status-row">
            <span className="dot dot-open" />
            <span>cluster: xtemplatehomelab</span>
          </div>
          <div className="status-row">
            <span className="dot dot-ok" />
            <span>images scanned: daily</span>
          </div>
          <div className="status-row">
            <span className={`dot ${user ? "dot-ok" : "dot-auth"}`} />
            <span>{user ? `signed in` : "not signed in"}</span>
          </div>
        </aside>
      </div>

      <footer className="footer">
        <span>Self-hosted. Secured with OAuth. Scanned on a schedule.</span>
      </footer>
    </div>
  );
}
