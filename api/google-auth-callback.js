module.exports = async function handler(req, res) {
  const code = req.query.code;
  if (!code) {
    res.status(400).send('Brak kodu autoryzacji');
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `https://${req.headers.host}/api/google-auth-callback`;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    const tokens = await tokenRes.json();

    if (!tokens.refresh_token) {
      res.status(400).send('Nie otrzymano refresh_token. Spróbuj ponownie i za pierwszym razem zaakceptuj pełną zgodę (czasem Google nie wysyła refresh_token przy kolejnych próbach — usuń dostęp appki w ustawieniach konta Google i spróbuj jeszcze raz).');
      return;
    }

    // Zapisz refresh_token w tym samym miejscu co reszta danych Bazy
    const BIN_ID = process.env.JSONBIN_BIN_ID;
    const API_KEY = process.env.JSONBIN_API_KEY;

    const getRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': API_KEY }
    });
    const getJson = await getRes.json();
    const data = getJson.record || {};
    data.googleRefreshToken = tokens.refresh_token;

    await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': API_KEY },
      body: JSON.stringify(data)
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`
      <html><body style="background:#14181B;color:#E8E4DB;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h2 style="color:#C9A876">✅ Kalendarz połączony</h2>
          <p>Możesz zamknąć tę kartę i wrócić do Bazy.</p>
        </div>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Błąd: ' + e.message);
  }
};
