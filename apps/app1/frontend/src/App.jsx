import { useState } from "react";
import "./App.css";

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "INR", "SGD"];

export default function App() {
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState("JPY");
  const [to, setTo] = useState("SGD");
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [customRate, setCustomRate] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // BASE_URL is "/app1/" (set in vite.config.js) — this must stay
      // prefixed so the request matches the ingress rule; Traefik strips
      // "/app1" before it reaches the Express route at /api/convert.
      const res = await fetch(`${import.meta.env.BASE_URL}api/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          from,
          to,
          customRate: useCustomRate ? customRate : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setResult(data);
    } catch (err) {
      setError("Network error — is the backend reachable?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <main className="card">
        <h1>Currency Converter</h1>
        <p className="subtitle">app1 — test app</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="amount">Amount</label>
          <input
            id="amount"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />

          <div className="row">
            <div className="field">
              <label htmlFor="from">From</label>
              <select id="from" value={from} onChange={(e) => setFrom(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <button type="button" className="swap" aria-label="Swap currencies" onClick={swap}>
              ⇄
            </button>

            <div className="field">
              <label htmlFor="to">To</label>
              <select id="to" value={to} onChange={(e) => setTo(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={useCustomRate}
              onChange={(e) => setUseCustomRate(e.target.checked)}
            />
            Use a custom exchange rate
          </label>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 1.08"
            value={customRate}
            onChange={(e) => setCustomRate(e.target.value)}
            disabled={!useCustomRate}
          />

          <button type="submit" className="primary" disabled={loading}>
            {loading ? "Converting…" : "Convert"}
          </button>
        </form>

        <p className={`result${error ? " error" : ""}`} aria-live="polite">
          {error
            ? error
            : result
            ? `${result.amount} ${result.from} = ${result.result.toFixed(4)} ${result.to} — rate ${result.rate.toFixed(
                6
              )}${result.source === "custom" ? " (custom)" : ""}`
            : ""}
        </p>
        <p className={`result${error ? " error" : ""}`} aria-live="polite">
          {error
            ? error
            : result
            ? `${result.to} to ${result.from} rate — ${result.rate.toFixed(
                6
              )}${result.source === "custom" ? " (custom)" : ""}`
            : ""}
        </p>
      </main>
    </div>
  );
}
