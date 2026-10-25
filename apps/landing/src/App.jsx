import "./App.css";
import { useEffect, useState, useRef } from "react";

const pub_apps = [
  { name: "Currency Converter", url: "https://app1.xtemplate.cc", label: "app1.xtemplate.cc" },
];

const priv_apps = [
  { name: "Local LLM", url: "https://app2.xtemplate.cc", label: "app2.xtemplate.cc" },
  { name: "Workout tracker", url: "https://app3.xtemplate.cc", label: "app3.xtemplate.cc" },
];

const admin_links = [
  { name: "Console", url: "https://console.xtemplate.cc" },
  { name: "Argo CD", url: "https://argocd.xtemplate.cc" },  // ← change this if needed
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
          <h1>Welcome to my personal cluster.</h1>
          <p className="lede">
            Private apps secured with OAuth. <br></br> Single-node k3s cluster running on HP EliteDesk.
          </p>

          <p className="sub">
            Public Apps
          </p>

          <nav className="apps" aria-label="Applications">
            {pub_apps.map((app) => (
              <a key={app.url} href={app.url} className="app-link">
                <span>{app.name}</span>
                <span className="app-path">{app.label}</span>
              </a>
            ))}
          </nav>

          <p className="sub">
            Private Apps
          </p>

          <nav className="apps" aria-label="Applications">
            {priv_apps.map((app) => (
              <a key={app.url} href={app.url} className="app-link">
                <span>{app.name}</span>
                <span className="app-path">{app.label}</span>
              </a>
            ))}
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
