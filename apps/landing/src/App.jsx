import "./App.css";
import { useEffect, useState } from "react";

const apps = [
  { name: "Currency Converter", url: "https://app1.xtemplate.cc", label: "app1.xtemplate.cc" },
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
          <h1>The front door to a personal cluster.</h1>
          <p className="lede">
            This page is open to anyone. Everything past it needs a GitHub
            sign-in.
          </p>

          <nav className="apps" aria-label="Applications">
            {apps.map((app) => (
              <a key={app.url} href={app.url} className="app-link">
                <span>{app.name}</span>
                <span className="app-path">{app.label}</span>
              </a>
            ))}
          </nav>
        </div>

        <aside className="status" aria-label="Cluster status">
          <div className="status-row">
            <span className="dot dot-ok" />
            <span>cluster: myowncluster</span>
          </div>
          <div className="status-row">
            <span className="dot dot-open" />
            <span>this page: public</span>
          </div>
          <div className="status-row">
            <span className="dot dot-auth" />
            <span>everything else: GitHub OAuth</span>
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
