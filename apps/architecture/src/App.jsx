import "./App.css";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import { requestPath, deployPath, roadmap, accessInfo } from "./data.js";

// ---------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------

// One tappable tile. Colour comes from the node's access type.
function Tile({ node, onOpen, focus, wide }) {
  const tint = accessInfo[node.access]?.tint || accessInfo.infra.tint;
  const dim = focus && focus !== node.access;
  return (
    <button
      type="button"
      className={`tile ${wide ? "tile-wide" : ""} ${dim ? "dim" : ""} ${node.access === "planned" ? "planned" : ""}`}
      style={{ "--tint": tint }}
      onClick={(e) => onOpen(node, e.currentTarget)}
      aria-haspopup="dialog"
    >
      <span className="tile-icon">
        <Icon name={node.icon} />
      </span>
      <span className="tile-text">
        <span className="tile-name">{node.name}</span>
        {node.sub && <span className="tile-sub">{node.sub}</span>}
      </span>
    </button>
  );
}

// The line between two layers, with a dot travelling down it.
function Link({ label }) {
  return (
    <div className="link" aria-hidden="true">
      <span className="link-line">
        <span className="link-dot" />
      </span>
      {label && <span className="link-label">{label}</span>}
    </div>
  );
}

function Layer({ layer, onOpen, focus }) {
  return (
    <section className="layer" aria-label={layer.label}>
      <h2 className="layer-label">{layer.label}</h2>
      {layer.groups ? (
        <div className="groups">
          {layer.groups.map((g) => (
            <div key={g.label} className={`group ${focus && focus !== g.access ? "dim-group" : ""}`}>
              <h3 className="group-label" style={{ "--tint": accessInfo[g.access].tint }}>
                {g.label}
              </h3>
              <div className="tiles">
                {g.nodes.map((n) => (
                  <Tile key={n.id} node={n} onOpen={onOpen} focus={focus} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={`tiles ${layer.nodes.length === 1 ? "tiles-single" : ""} ${layer.nodes.length === 2 ? "tiles-pair" : ""}`}
        >
          {layer.nodes.map((n) => (
            <Tile key={n.id} node={n} onOpen={onOpen} focus={focus} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// View 1: request path
// ---------------------------------------------------------------------
function RequestView({ onOpen, focus }) {
  const { outside, cluster, node, external } = requestPath;
  return (
    <div className="view">
      {outside.map((layer) => (
        <div key={layer.id}>
          <Layer layer={layer} onOpen={onOpen} focus={focus} />
          <Link label={layer.link} />
        </div>
      ))}

      {/* the dashed box = the physical machine + k3s */}
      <div className="cluster">
        <button
          type="button"
          className="cluster-head"
          onClick={(e) => onOpen(node, e.currentTarget)}
          aria-haspopup="dialog"
        >
          <Icon name={node.icon} className="cluster-icon" />
          <span>
            <span className="cluster-name">{node.name}</span>
            <span className="cluster-sub">{node.sub}</span>
          </span>
          <span className="cluster-more">details</span>
        </button>

        {cluster.map((layer, i) => (
          <div key={layer.id}>
            <Layer layer={layer} onOpen={onOpen} focus={focus} />
            {i < cluster.length - 1 && <Link label={layer.link} />}
          </div>
        ))}
      </div>

      <Link label="apps call out to" />
      <Layer layer={external} onOpen={onOpen} focus={focus} />

      <section className="layer roadmap" aria-label="Coming next">
        <h2 className="layer-label">Coming next</h2>
        <div className="tiles">
          {roadmap.map((n) => (
            <Tile key={n.id} node={n} onOpen={onOpen} focus={focus} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// View 2: deploy path (git push → running pod)
// ---------------------------------------------------------------------
function DeployView({ onOpen, focus }) {
  return (
    <div className="view">
      <ol className="steps">
        {deployPath.map((s, i) => {
          const tint = accessInfo[s.access].tint;
          return (
            <li key={s.id} className="step" style={{ "--i": i, "--tint": tint }}>
              <span className="step-num">{s.step}</span>
              <Tile node={s} onOpen={onOpen} focus={focus} wide />
            </li>
          );
        })}
      </ol>

      <div className="loops">
        <div className="loop">
          <span className="loop-tag">weekly</span>
          <span>Registry clean-up keeps the 5 newest versions of each image.</span>
        </div>
        <div className="loop">
          <span className="loop-tag">daily</span>
          <span>Trivy Operator re-scans every running image for new CVEs.</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Popup: bottom sheet on phones, centred card on bigger screens
// ---------------------------------------------------------------------
function Detail({ node, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
    };
  }, [onClose]);

  const info = accessInfo[node.access] || accessInfo.infra;

  return (
    <div className="backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        style={{ "--tint": info.tint }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="grabber" aria-hidden="true" />
        <div className="sheet-head">
          <span className="tile-icon sheet-icon">
            <Icon name={node.icon} />
          </span>
          <div className="sheet-titles">
            <h2 id="sheet-title">{node.name}</h2>
            <div className="badges">
              <span className="badge">{info.label}</span>
              {node.ns && <span className="badge badge-mono">ns: {node.ns}</span>}
            </div>
          </div>
          <button ref={closeRef} type="button" className="close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <p className="about">{node.about}</p>

        {node.facts?.length > 0 && (
          <ul className="facts">
            {node.facts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}

        {node.url && (
          <a className="open-link" href={node.url}>
            Open {node.url.replace("https://", "")}
            <Icon name="arrow" />
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------
const filters = ["public", "private", "platform", "infra", "external"];

export default function App() {
  const [view, setView] = useState("request"); // "request" | "deploy"
  const [selected, setSelected] = useState(null); // node shown in the popup
  const [focus, setFocus] = useState(null); // legend filter: dims other tiles
  const [hint, setHint] = useState(true); // the "tap a tile" toast
  const opener = useRef(null); // tile that opened the popup, to return focus

  useEffect(() => {
    const t = setTimeout(() => setHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  const open = (node, el) => {
    opener.current = el;
    setHint(false);
    setSelected(node);
  };
  const close = () => {
    setSelected(null);
    opener.current?.focus();
  };

  return (
    <div className="page">
      <header className="top">
        <a className="back" href="https://xtemplate.cc">
          <Icon name="back" />
          xtemplate.cc
        </a>

        <h1>Architecture</h1>
        <p className="lede">
          How the home lab fits together: one k3s node, a Cloudflare tunnel in, GitHub login in front of
          the private apps, and Argo CD deploying from git.
        </p>

        <div className="tabs" role="tablist" aria-label="Diagram">
          <button
            role="tab"
            aria-selected={view === "request"}
            className={`tab ${view === "request" ? "on" : ""}`}
            onClick={() => setView("request")}
          >
            Request path
          </button>
          <button
            role="tab"
            aria-selected={view === "deploy"}
            className={`tab ${view === "deploy" ? "on" : ""}`}
            onClick={() => setView("deploy")}
          >
            Deploy path
          </button>
          <span className={`tab-pill ${view}`} aria-hidden="true" />
        </div>

        <div className="legend" aria-label="Highlight by type">
          {filters.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip ${focus === k ? "on" : ""}`}
              style={{ "--tint": accessInfo[k].tint }}
              aria-pressed={focus === k}
              onClick={() => setFocus(focus === k ? null : k)}
            >
              <span className="chip-dot" />
              {accessInfo[k].label}
            </button>
          ))}
        </div>
      </header>

      <main key={view}>
        {view === "request" ? (
          <RequestView onOpen={open} focus={focus} />
        ) : (
          <DeployView onOpen={open} focus={focus} />
        )}
      </main>

      <footer className="footer">
        <span>Self-hosted on k3s. Drawn from the repo's manifests.</span>
      </footer>

      <div className={`toast ${hint ? "show" : ""}`} role="status">
        Tap any tile for details
      </div>

      {selected && <Detail node={selected} onClose={close} />}
    </div>
  );
}
