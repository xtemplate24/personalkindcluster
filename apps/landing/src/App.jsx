import "./App.css";
import { useEffect, useState } from "react";

const pub_apps = [
  { name: "Currency Converter", url: "https://app1.xtemplate.cc", label: "app1.xtemplate.cc" },
];

const priv_apps = [
  { name: "Local LLM", url: "https://app2.xtemplate.cc", label: "app2.xtemplate.cc" },
  { name: "Workout tracker", url: "https://app3.xtemplate.cc", label: "app3.xtemplate.cc" },
];

export default function App() {

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
      <div className="hero">
        <div className="hero-copy">
          <h1>Welcome to my personal cluster.</h1>
          <p className="lede">
            Private apps secured with OAuth. Single-node k3s cluster running on HP EliteDesk.
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
