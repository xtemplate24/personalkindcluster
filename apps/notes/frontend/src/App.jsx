import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const API = `${import.meta.env.BASE_URL}api`;
const SAVE_DELAY = 700; // ms of no typing before a note autosaves

// ---------- API helpers ----------
async function call(path, { method, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  // If the login cookie expired, oauth2-proxy answers with its sign-in page (HTML).
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  if (!isJson) throw new Error("You've been signed out. Reload the page to sign in again.");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// fetch() can't report upload progress, XMLHttpRequest can.
function uploadFile(noteId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/notes/${noteId}/files`);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

// ---------- formatting ----------
const fmtSize = (b) =>
  b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : b < 1024 ** 3 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${(b / 1024 ** 3).toFixed(2)} GB`;

const fmtDate = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() && { year: "numeric" }) });
};

const ext = (name) => (name.includes(".") ? name.split(".").pop().slice(0, 4).toUpperCase() : "FILE");
const isImage = (type) => /^image\/(png|jpeg|gif|webp|avif)$/.test(type);

// ---------- tiny icon set (stroke icons, inherit colour) ----------
const PATHS = {
  plus: "M12 5v14M5 12h14",
  back: "M15 18l-6-6 6-6",
  clip: "M21 11.5l-8.6 8.6a5 5 0 01-7.1-7.1l8.6-8.6a3.3 3.3 0 014.7 4.7l-8.6 8.6a1.7 1.7 0 01-2.4-2.4l8-8",
  down: "M12 4v12m0 0l-5-5m5 5l5-5M5 20h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5",
  upload: "M12 16V4m0 0L7 9m5-5l5 5M5 20h14",
  x: "M6 6l12 12M18 6L6 18",
};
const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);

// The open note lives in the URL hash (#/n/<id>) so the browser back button works.
const readHash = () => (window.location.hash.match(/^#\/n\/([0-9a-f-]{36})$/) || [])[1] || null;

// =====================================================================
export default function App() {
  const [openId, setOpenId] = useState(readHash);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    const onHash = () => setOpenId(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const refreshUsage = useCallback(() => call("/usage").then(setUsage).catch(() => {}), []);
  useEffect(() => { refreshUsage(); }, [refreshUsage]);

  const open = (id) => { window.location.hash = id ? `/n/${id}` : ""; };

  return (
    <div className="page">
      {openId ? (
        <Editor key={openId} id={openId} usage={usage} onClose={() => open(null)} onUsage={refreshUsage} />
      ) : (
        <NoteList usage={usage} onOpen={open} />
      )}
    </div>
  );
}

// =====================================================================
function NoteList({ usage, onOpen }) {
  const [notes, setNotes] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    call("/notes").then(setNotes).catch((e) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    if (!notes) return [];
    const s = search.trim().toLowerCase();
    return s ? notes.filter((n) => `${n.title} ${n.preview}`.toLowerCase().includes(s)) : notes;
  }, [notes, search]);

  const columnCount = useColumnCount();
  const columns = useMemo(() => splitIntoColumns(shown, columnCount), [shown, columnCount]);

  const create = async () => {
    setCreating(true);
    try {
      const n = await call("/notes", { body: { title: "", body: "" } });
      onOpen(n.id);
    } catch (e) {
      setError(e.message);
      setCreating(false);
    }
  };

  return (
    <div className="screen">
      <header className="top">
        <div>
          <h1>Notes</h1>
          <p className="muted small">Your notes and files, stored on the home lab.</p>
        </div>
        <button className="primary" onClick={create} disabled={creating}>
          <Icon name="plus" /> New note
        </button>
      </header>

      {usage && <UsageBar usage={usage} />}

      <label className="search">
        <Icon name="search" />
        <input
          type="search"
          placeholder="Search notes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search notes"
        />
      </label>

      {error && <p className="error">{error}</p>}
      {!notes && !error && <div className="spinner" />}

      {notes && notes.length === 0 && (
        <div className="empty glass">
          <p>No notes yet.</p>
          <p className="muted small">Create one, then drop files onto it to attach them.</p>
        </div>
      )}
      {notes && notes.length > 0 && shown.length === 0 && <p className="muted center">Nothing matches “{search}”.</p>}

      <div className="masonry">
        {columns.map((col, c) => (
          <ul className="masonry-col" key={c}>
            {col.map(({ note: n, i }) => (
              <li key={n.id} style={{ "--i": Math.min(i, 12) }}>
                <button className="note-card" onClick={() => onOpen(n.id)}>
                  {n.cover && <img className="note-cover" src={`${API}/files/${n.cover}`} alt="" loading="lazy" />}
                  <span className="note-text">
                    <span className="note-title">{n.title || "Untitled"}</span>
                    {previewOf(n) && <span className="note-preview">{previewOf(n)}</span>}
                    <span className="note-meta">
                      <span>{fmtDate(n.updated)}</span>
                      {n.files > 0 && (
                        <span className="pill"><Icon name="clip" size={13} /> {n.files}</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

// Keep line breaks, but squash runs of blank lines.
const previewOf = (n) => n.preview.replace(/\n{3,}/g, "\n\n").trim();

// Rough height of a card, so each note can go into whichever column is shorter.
function estimateHeight(n) {
  const lines = previewOf(n)
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 26)), 0);
  return 70 + Math.min(lines, 8) * 21 + (n.cover ? 140 : 0);
}

// Two columns, or one on very narrow screens.
function useColumnCount() {
  const pick = () => (window.innerWidth < 360 ? 1 : 2);
  const [count, setCount] = useState(pick);
  useEffect(() => {
    const onResize = () => setCount(pick());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return count;
}

// Deal notes out like Pinterest: newest first, each one into the shorter column.
// (CSS "columns" would fill the whole left column first and break newest-first order.)
function splitIntoColumns(notes, count) {
  const cols = Array.from({ length: count }, () => ({ items: [], height: 0 }));
  notes.forEach((note, i) => {
    const shortest = cols.reduce((a, b) => (b.height < a.height ? b : a));
    shortest.items.push({ note, i });
    shortest.height += estimateHeight(note);
  });
  return cols.map((c) => c.items);
}

function UsageBar({ usage }) {
  const pct = Math.min(100, (usage.used / usage.quota) * 100);
  return (
    <div className="usage" title={`${fmtSize(usage.used)} of ${fmtSize(usage.quota)} used`}>
      <div className="track"><div className="fill" style={{ width: `${pct}%` }} /></div>
      <span className="mono small muted">{fmtSize(usage.used)} / {fmtSize(usage.quota)}</span>
    </div>
  );
}

// =====================================================================
function Editor({ id, usage, onClose, onUsage }) {
  const [note, setNote] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("saved"); // saved | dirty | saving | error
  const [confirmDelete, setConfirmDelete] = useState(false);

  const draft = useRef(null);  // latest title/body, read by the save timer
  const timer = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    call(`/notes/${id}`)
      .then((n) => { setNote(n); draft.current = { title: n.title, body: n.body }; })
      .catch((e) => setError(e.message));
    return () => clearTimeout(timer.current);
  }, [id]);

  // grow the textarea with its content
  useEffect(() => {
    const el = bodyRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [note?.body]);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    if (!draft.current) return;
    setStatus("saving");
    try {
      await call(`/notes/${id}`, { method: "PUT", body: draft.current });
      setStatus("saved");
    } catch (e) {
      setStatus("error");
      setError(e.message);
    }
  }, [id]);

  const edit = (field) => (e) => {
    const value = e.target.value;
    setNote((n) => ({ ...n, [field]: value }));
    draft.current = { ...draft.current, [field]: value };
    setStatus("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY);
  };

  // Leaving: save pending changes; quietly drop a note that was never used.
  const close = async () => {
    if (note && !note.title.trim() && !note.body.trim() && note.files.length === 0) {
      await call(`/notes/${id}`, { method: "DELETE" }).catch(() => {});
    } else if (status === "dirty") {
      await save();
    }
    onClose();
  };

  // Save before the tab closes or reloads.
  useEffect(() => {
    const onLeave = () => {
      if (status === "dirty" && draft.current) {
        fetch(`${API}/notes/${id}`, {
          method: "PUT", keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft.current),
        });
      }
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [id, status]);

  const removeNote = async () => {
    try {
      await call(`/notes/${id}`, { method: "DELETE" });
      onUsage();
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };

  const setFiles = (fn) => setNote((n) => ({ ...n, files: fn(n.files) }));

  if (!note) {
    return (
      <div className="screen">
        <button className="ghost back" onClick={onClose}><Icon name="back" /> All notes</button>
        {error ? <p className="error">{error}</p> : <div className="spinner" />}
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="editor-bar">
        <button className="ghost back" onClick={close}><Icon name="back" /> All notes</button>
        <span className={`save-state ${status}`} aria-live="polite">
          {{ saved: "Saved", dirty: "Editing…", saving: "Saving…", error: "Not saved" }[status]}
        </span>
      </div>

      <div className="sheet glass">
        <input
          className="title-input"
          placeholder="Title"
          value={note.title}
          onChange={edit("title")}
          maxLength={200}
          aria-label="Title"
        />
        <textarea
          ref={bodyRef}
          className="body-input"
          placeholder="Start writing…"
          value={note.body}
          onChange={edit("body")}
          aria-label="Note"
        />
      </div>

      {error && <p className="error">{error}</p>}

      <Attachments
        noteId={id}
        files={note.files}
        setFiles={setFiles}
        maxFile={usage?.maxFile ?? 50 * 1024 * 1024}
        onUsage={onUsage}
      />

      <div className="note-footer">
        <span className="muted small">Edited {fmtDate(note.updated)}</span>
        {!confirmDelete ? (
          <button className="ghost danger-text" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" /> Delete note
          </button>
        ) : (
          <div className="confirm pop">
            <span>Delete this note{note.files.length ? ` and ${note.files.length} file${note.files.length > 1 ? "s" : ""}` : ""}?</span>
            <button onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className="danger" onClick={removeNote}>Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
function Attachments({ noteId, files, setFiles, maxFile, onUsage }) {
  const [queue, setQueue] = useState([]); // uploads in progress: {key, name, progress, error}
  const [dragging, setDragging] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const input = useRef(null);
  const busy = useRef(false);    // is the upload loop running?
  const pending = useRef([]);    // files waiting their turn

  const patch = (key, changes) => setQueue((q) => q.map((u) => (u.key === key ? { ...u, ...changes } : u)));

  // Uploads run one at a time, so the backend never holds several big files at once.
  const addFiles = async (list) => {
    const items = [...list].map((file) => ({
      key: `${file.name}-${file.size}-${Math.random()}`,
      file, name: file.name, progress: 0,
      error: file.size > maxFile ? `Over the ${fmtSize(maxFile)} limit` : file.size === 0 ? "Empty file" : "",
    }));
    setQueue((q) => [...q, ...items]);
    if (busy.current) { pending.current.push(...items); return; }
    busy.current = true;
    pending.current.push(...items);
    while (pending.current.length) {
      const u = pending.current.shift();
      if (u.error) continue;
      try {
        const saved = await uploadFile(noteId, u.file, (p) => patch(u.key, { progress: p }));
        setFiles((f) => [...f, saved]);
        setQueue((q) => q.filter((x) => x.key !== u.key));
        onUsage();
      } catch (e) {
        patch(u.key, { error: e.message });
      }
    }
    busy.current = false;
  };

  // paste a screenshot anywhere on the page to attach it
  useEffect(() => {
    const onPaste = (e) => {
      const pasted = [...(e.clipboardData?.files || [])];
      if (pasted.length) { e.preventDefault(); addFiles(pasted); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const remove = async (id) => {
    setConfirmId(null);
    try {
      await call(`/files/${id}`, { method: "DELETE" });
      setFiles((f) => f.filter((x) => x.id !== id));
      onUsage();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <section className="attachments">
      <h2><Icon name="clip" size={16} /> Attachments {files.length > 0 && <span className="muted">· {files.length}</span>}</h2>

      <div
        className={`drop ${dragging ? "over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      >
        <Icon name="upload" size={22} />
        <span>Drop files here, paste, or <u>browse</u></span>
        <span className="muted small">Up to {fmtSize(maxFile)} each</span>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {queue.length > 0 && (
        <ul className="uploads">
          {queue.map((u) => (
            <li key={u.key} className={u.error ? "failed" : ""}>
              <span className="up-name">{u.name}</span>
              {u.error ? (
                <>
                  <span className="error small">{u.error}</span>
                  <button className="icon-btn" aria-label="Dismiss"
                    onClick={() => setQueue((q) => q.filter((x) => x.key !== u.key))}><Icon name="x" size={16} /></button>
                </>
              ) : (
                <>
                  <div className="track"><div className="fill live" style={{ width: `${u.progress * 100}%` }} /></div>
                  <span className="mono small muted">{Math.round(u.progress * 100)}%</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="files">
          {files.map((f, i) => (
            <li key={f.id} className="file glass" style={{ "--i": Math.min(i, 12) }}>
              <a className="thumb" href={`${API}/files/${f.id}`} target="_blank" rel="noopener noreferrer">
                {isImage(f.type) ? (
                  <img src={`${API}/files/${f.id}`} alt={f.name} loading="lazy" />
                ) : (
                  <span className="ext">{ext(f.name)}</span>
                )}
              </a>
              <div className="file-info">
                <span className="file-name" title={f.name}>{f.name}</span>
                <span className="muted small mono">{fmtSize(f.size)}</span>
              </div>
              {confirmId === f.id ? (
                <div className="file-actions pop">
                  <button className="danger small-btn" onClick={() => remove(f.id)}>Delete</button>
                  <button className="small-btn" onClick={() => setConfirmId(null)}>Keep</button>
                </div>
              ) : (
                <div className="file-actions">
                  <a className="icon-btn" href={`${API}/files/${f.id}?download`} aria-label={`Download ${f.name}`}>
                    <Icon name="down" size={16} />
                  </a>
                  <button className="icon-btn" aria-label={`Delete ${f.name}`} onClick={() => setConfirmId(f.id)}>
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
