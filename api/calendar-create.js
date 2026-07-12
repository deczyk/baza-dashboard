module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const BIN_ID = process.env.JSONBIN_BIN_ID;
  const API_KEY = process.env.JSONBIN_API_KEY;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const { title, date, time } = req.body;
  if (!title || !date) {
    res.status(400).json({ error: 'Brak tytułu lub daty' });
    return;
  }

  try {
    const getRes = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': API_KEY }
    });
    const getJson = await getRes.json();
    const data = getJson.record || {};

    if (!data.googleRefreshToken) {
      res.status(400).json({ error: 'Kalendarz nie jest połączony' });
      return;
    }

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
      res.status(400).json({ error: 'Token wygasł, połącz ponownie' });
      return;
    }

    let eventBody;
    if (time) {
      const startDateTime = `${date}T${time}:00`;
      const startDate = new Date(startDateTime);
      const endDate = new Date(startDate.getTime() + 60 * 60000); // domyślnie 1h
      eventBody = {
        summary: title,
        start: { dateTime: startDate.toISOString(), timeZone: 'Europe/Warsaw' },
        end: { dateTime: endDate.toISOString(), timeZone: 'Europe/Warsaw' }
      };
    } else {
      eventBody = {
        summary: title,
        start: { date: date },
        end: { date: date }
      };
    }

    const createRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventBody)
      }
    );
    const createJson = await createRes.json();

    if (createJson.error) {
      res.status(400).json({ error: createJson.error.message });
      return;
    }

    res.status(200).json({ success: true, event: createJson });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
