import { useEffect, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import Markdown from "./Markdown.jsx";

const STORAGE_KEY = "app2-chats";
const MAX_CHATS = 3;          // how many conversations to keep
const MAX_CONTEXT = 8;        // last N messages sent to the model (it has a small memory window)
const API_URL = `${import.meta.env.BASE_URL}api/v1/chat/completions`;

// Starter prompts shown on an empty chat. Tapping one sends it.
const SUGGESTIONS = [
  "Explain Kubernetes pods like I'm new to it",
  "Write a short bash script to tidy my Downloads folder",
  "Give me 3 quick dinner ideas with eggs",
  "Summarise the difference between TCP and UDP",
];

const makeChat = () => ({ id: String(Date.now()), title: "New chat", messages: [] });

function loadChats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved) && saved.length) return saved.slice(0, MAX_CHATS);
  } catch {
    // ignore corrupted or unavailable storage
  }
  return [makeChat()];
}

// Three bouncing dots while the model hasn't sent its first word yet
const Typing = () => (
  <span className="typing" aria-label="Thinking">
    <i /><i /><i />
  </span>
);

export default function App() {
  const [chats, setChats] = useState(loadChats);
  const [activeId, setActiveId] = useState(() => loadChats()[0].id);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmNew, setConfirmNew] = useState(false); // "oldest chat will be deleted" prompt
  const bottomRef = useRef(null);
  const boxRef = useRef(null);
  const abortRef = useRef(null);

  const active = chats.find((c) => c.id === activeId) || chats[0];

  // Save to the browser whenever chats change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch {
      // storage full or blocked: keep working without saving
    }
  }, [chats]);

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active.messages]);

  // Grow the text box with its content (up to the max-height in CSS).
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const updateChat = (id, fn) =>
    setChats((all) => all.map((c) => (c.id === id ? fn(c) : c)));

  const startNewChat = (force = false) => {
    // Already on an empty chat: nothing to do
    if (!active.messages.length) { boxRef.current?.focus(); return; }
    if (chats.length >= MAX_CHATS && !force) { setConfirmNew(true); return; }
    const fresh = makeChat();
    setChats((all) => [fresh, ...all].slice(0, MAX_CHATS));
    setActiveId(fresh.id);
    setConfirmNew(false);
    setError(null);
  };

  const deleteChat = (id) => {
    const rest = chats.filter((c) => c.id !== id);
    if (rest.length === 0) {
      const fresh = makeChat();
      setChats([fresh]);
      setActiveId(fresh.id);
      return;
    }
    setChats(rest);
    if (id === activeId) setActiveId(rest[0].id);
  };

  const stop = () => abortRef.current?.abort();

  const send = async (raw) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;

    const id = active.id;
    const history = [...active.messages, { role: "user", content: text }];

    setInput("");
    setError(null);
    setBusy(true);
    updateChat(id, (c) => ({
      ...c,
      title: c.messages.length ? c.title : text.slice(0, 40),
      messages: [...history, { role: "assistant", content: "" }],
    }));

    const controller = new AbortController();
    abortRef.current = controller;
    let reply = "";

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-MAX_CONTEXT),
          stream: true,
          max_tokens: 512,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      // The server sends the reply in small pieces; show them as they arrive.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          const piece = JSON.parse(data).choices?.[0]?.delta?.content;
          if (piece) {
            reply += piece;
            const snapshot = reply;
            updateChat(id, (c) => ({
              ...c,
              messages: [...c.messages.slice(0, -1), { role: "assistant", content: snapshot }],
            }));
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        // Stopped by the user: keep whatever arrived so far
        updateChat(id, (c) => ({
          ...c,
          messages: [...c.messages.slice(0, -1), { role: "assistant", content: reply || "_Stopped._", stopped: true }],
        }));
      } else {
        // Drop the empty reply bubble so the chat doesn't show a blank answer
        if (!reply) updateChat(id, (c) => ({ ...c, messages: c.messages.slice(0, -1) }));
        setError(`${err.message}. If this keeps happening, reload the page (your login may have expired).`);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      boxRef.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    // Enter sends, Shift+Enter adds a new line
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const last = active.messages.length - 1;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <a className="back" href="https://xtemplate.cc">
            <Icon name="back" />
            xtemplate.cc
          </a>
          <h1>Chat</h1>
        </div>

        <button className="new-chat" onClick={() => startNewChat()} disabled={busy}>
          <Icon name="plus" />
          New chat
        </button>

        {confirmNew && (
          <div className="confirm">
            <p>Only {MAX_CHATS} chats are kept. A new one deletes the oldest.</p>
            <div className="row">
              <button className="btn" onClick={() => setConfirmNew(false)}>Cancel</button>
              <button className="btn accent" onClick={() => startNewChat(true)}>Continue</button>
            </div>
          </div>
        )}

        <h2 className="caption">Recent</h2>
        <nav className="chat-list" aria-label="Chats">
          {chats.map((c) => (
            <div key={c.id} className={`chat-item${c.id === active.id ? " active" : ""}`}>
              <button className="chat-title" onClick={() => { setActiveId(c.id); setError(null); }} disabled={busy}>
                <Icon name="chat" />
                <span>{c.title}</span>
              </button>
              <button className="chat-delete" aria-label={`Delete chat ${c.title}`} onClick={() => deleteChat(c.id)} disabled={busy}>
                <Icon name="x" />
              </button>
            </div>
          ))}
        </nav>
        <p className="hint">Chats are saved in this browser only.</p>
      </aside>

      <main className="main">
        <div className="messages">
          {active.messages.length === 0 ? (
            <div className="empty">
              <span className="empty-icon"><Icon name="spark" /></span>
              <h2>What's on your mind?</h2>
              <p>Runs entirely on the home lab. Nothing leaves the house.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s, k) => (
                  <button key={s} className="suggestion" style={{ "--i": k }} onClick={() => send(s)} disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="thread">
              {active.messages.map((m, i) => (
                <div key={i} className={`msg ${m.role}`}>
                  {m.role === "assistant" && <span className="avatar"><Icon name="spark" /></span>}
                  <div className="bubble">
                    {m.role === "user" ? (
                      m.content
                    ) : m.content ? (
                      <>
                        <Markdown text={m.content} />
                        {busy && i === last && <span className="caret" />}
                      </>
                    ) : (
                      busy && i === last && <Typing />
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="dock">
          {error && <p className="error">{error}</p>}
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea
              ref={boxRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message the local model"
              aria-label="Message"
              autoFocus
            />
            {busy ? (
              <button type="button" className="send stop" onClick={stop} aria-label="Stop generating">
                <Icon name="stop" />
              </button>
            ) : (
              <button type="submit" className="send" disabled={!input.trim()} aria-label="Send">
                <Icon name="send" />
              </button>
            )}
          </form>
          <p className="fine">Enter to send · Shift+Enter for a new line · remembers the last {MAX_CONTEXT} messages</p>
        </div>
      </main>
    </div>
  );
}
