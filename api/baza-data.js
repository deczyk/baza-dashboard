module.exports = async function handler(req, res) {
  const BIN_ID = process.env.JSONBIN_BIN_ID;
  const API_KEY = process.env.JSONBIN_API_KEY;

  if (!BIN_ID || !API_KEY) {
    res.status(500).json({ error: 'Brak skonfigurowanych zmiennych środowiskowych na Vercel' });
    return;
  }

  const base = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${base}/latest`, {
        headers: { 'X-Master-Key': API_KEY }
      });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    if (req.method === 'PUT') {
      const r = await fetch(base, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': API_KEY
        },
        body: JSON.stringify(req.body)
      });
      const data = await r.json();
      res.status(r.status).json(data);
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
