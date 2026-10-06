import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Used by the Deployment's readiness/liveness probes.
app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

app.post("/api/convert", async (req, res) => {
  try {
    const { from, to, amount, customRate } = req.body || {};

    if (!from || !to || amount === undefined || amount === null || amount === "") {
      return res.status(400).json({ error: "from, to and amount are required" });
    }

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ error: "amount must be a positive number" });
    }

    const fromCode = String(from).toUpperCase();
    const toCode = String(to).toUpperCase();

    // If a custom rate was supplied, skip the external lookup entirely.
    if (customRate !== undefined && customRate !== null && customRate !== "") {
      const rate = Number(customRate);
      if (Number.isNaN(rate) || rate <= 0) {
        return res.status(400).json({ error: "customRate must be a positive number" });
      }
      return res.json({
        from: fromCode,
        to: toCode,
        amount: numericAmount,
        rate,
        result: numericAmount * rate,
        source: "custom",
      });
    }

    if (fromCode === toCode) {
      return res.json({
        from: fromCode,
        to: toCode,
        amount: numericAmount,
        rate: 1,
        result: numericAmount,
        source: "identity",
      });
    }

    // frankfurter.app is a free, keyless exchange-rate API backed by ECB reference rates.
    const url = `https://api.frankfurter.app/latest?amount=${numericAmount}&from=${encodeURIComponent(
      fromCode
    )}&to=${encodeURIComponent(toCode)}`;

    const upstream = await fetch(url);
    if (!upstream.ok) {
      const detail = await upstream.text();
      return res.status(502).json({ error: "upstream rate lookup failed", detail });
    }

    const data = await upstream.json();
    const result = data.rates?.[toCode];

    if (result === undefined) {
      return res.status(400).json({ error: `no rate available for ${fromCode} -> ${toCode}` });
    }

    return res.json({
      from: fromCode,
      to: toCode,
      amount: numericAmount,
      rate: result / numericAmount,
      exrate: numericAmount / result,
      result,
      source: "frankfurter.app",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

app.listen(PORT, () => {
  console.log(`app1-backend listening on ${PORT}`);
});
