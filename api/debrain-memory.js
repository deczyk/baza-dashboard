// api/debrain-memory.js — trwała pamięć konwersacji Debrain (Vercel Serverless Function)
// Wymaga zmiennych środowiskowych w Vercel:
//   DEBRAIN_JSONBIN_BIN_ID  — ID nowego binu w jsonbin.io (osobnego od tego, którego używa Baza!)
//   JSONBIN_API_KEY         — Twój X-Master-Key z jsonbin.io (możesz użyć tego samego co dla Bazy)
//
// Załóż nowy, PUSTY bin na jsonbin.io (np. z zawartością {"history":[]}) i wklej jego ID tutaj jako env var.

module.exports = async (req, res) => {
  const BIN_ID = process.env.DEBRAIN_JSONBIN_BIN_ID;
  const KEY = process.env.JSONBIN_API_KEY;
  const BASE = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

  if (!BIN_ID || !KEY) {
    res.status(200).json({ history: [], warning: "Pamięć trwała nieskonfigurowana (brak env var)." });
    return;
  }

  if (req.method === "GET") {
    try {
      const r = await fetch(`${BASE}/latest`, { headers: { "X-Master-Key": KEY } });
      const data = await r.json();
      res.status(200).json({
        history: (data.record && data.record.history) || [],
        lastGreetingDate: (data.record && data.record.lastGreetingDate) || null,
      });
    } catch (e) {
      res.status(200).json({ history: [], lastGreetingDate: null, error: e.message });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const { history, lastGreetingDate } = req.body;
      await fetch(BASE, {
        method: "PUT",
        headers: { "X-Master-Key": KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ history: history || [], lastGreetingDate: lastGreetingDate || null }),
      });
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
