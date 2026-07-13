const store = require("./_supabase-store");

module.exports = async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  try {
    const { record: data } = await store.getLatest();

    if (!data.googleRefreshToken) {
      res.status(200).json({ connected: false, events: [] });
      return;
    }

    // Wymień refresh_token na świeży access_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: data.googleRefreshToken,
        grant_type: 'refresh_token'
      })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      res.status(200).json({ connected: false, events: [], error: 'Token wygasł, połącz ponownie' });
      return;
    }

    const now = new Date().toISOString();
    const in7days = new Date(Date.now() + 7 * 86400000).toISOString();

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${in7days}&singleEvents=true&orderBy=startTime&maxResults=10`,
      { headers: { Authorization: `Bearer ${tokenJson.access_token}` } }
    );
    const calJson = await calRes.json();

    const events = (calJson.items || []).map(ev => ({
      title: ev.summary || '(bez tytułu)',
      start: ev.start?.dateTime || ev.start?.date,
      allDay: !ev.start?.dateTime
    }));

    res.status(200).json({ connected: true, events });
  } catch (e) {
    res.status(500).json({ connected: false, events: [], error: e.message });
  }
};
