const store = require("./_supabase-store");

module.exports = async function handler(req, res) {
  if (req.method === 'GET' && req.query?.resource === 'capitol-trades') {
    await getCapitolTrades(res);
    return;
  }

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

async function getCapitolTrades(res) {
  try {
    const response = await fetch('https://www.bargo.ai/free-apis/congress/v1/trades?limit=15', {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      res.status(200).json({ ok: false, reason: `Źródło danych odpowiedziało statusem ${response.status}` });
      return;
    }

    const payload = await response.json();
    const trades = Array.isArray(payload.trades) ? payload.trades.map(trade => ({
      politician: { name: trade.member || '—' },
      issuer: {
        name: trade.asset || trade.ticker || '—',
        ticker: trade.ticker || '',
      },
      type: trade.type || '',
      transactionDate: trade.transaction_date || '',
      disclosureDate: trade.disclosure_date || '',
      amount: trade.amount_range || '',
    })) : [];

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).json({
      ok: trades.length > 0,
      trades,
      source: 'Bargo Congress Trades',
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(200).json({ ok: false, reason: error.message });
  }
}
