const store = require("./_supabase-store");

module.exports = async function handler(req, res) {
  const providedPassword = req.headers['x-panel-password'];
  if (providedPassword !== process.env.PANEL_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!store.configured()) {
    res.status(500).json({ error: 'Brak skonfigurowanych zmiennych środowiskowych na Vercel (SUPABASE_URL / SUPABASE_SECRET_KEY)' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const data = await store.getLatest();
      res.status(200).json(data);
      return;
    }

    if (req.method === 'PUT') {
      const data = await store.putRecord(req.body);
      res.status(200).json(data);
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
