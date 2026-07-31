const store = require('./_supabase-store');

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const callbackUrl = (req) => `https://${req.headers.host}/api/google-auth-callback`;

async function tokenFor(data) {
  const refreshToken = data.werboardCalendar?.refreshToken;
  if (!refreshToken) return null;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  const token = await response.json();
  if (!token.access_token) throw new Error('Połączenie z Google wygasło. Połącz kalendarz ponownie.');
  return token.access_token;
}
async function google(token, path, options = {}) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  if (response.status === 204) return {};
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Błąd Google Calendar.');
  return data;
}
function eventView(event) { return { id: event.id, title: event.summary || '(bez tytułu)', start: event.start?.dateTime || event.start?.date, allDay: !event.start?.dateTime }; }

module.exports = async function handler(req, res) {
  try {
    const { record: data } = await store.getLatest();
    const action = req.method === 'GET' ? String(req.query.action || 'overview') : String(req.body?.action || '');
    if (req.method === 'POST' && action === 'disconnect') { await store.mutateRecord((state) => { delete state.werboardCalendar; }); res.json({ ok: true }); return; }
    const token = await tokenFor(data);
    if (!token) { res.json({ connected: false, events: [], calendars: [] }); return; }
    const selected = data.werboardCalendar?.calendarId || 'primary';
    if (req.method === 'POST' && action === 'select-calendar') { const calendarId = String(req.body.calendarId || 'primary'); await store.mutateRecord((state) => { state.werboardCalendar = { ...(state.werboardCalendar || {}), calendarId }; }); res.json({ ok: true }); return; }
    if (req.method === 'POST' && ['create', 'update', 'delete'].includes(action)) {
      const calendarId = encodeURIComponent(selected); const id = encodeURIComponent(String(req.body.id || ''));
      if (action === 'delete') { await google(token, `/calendars/${calendarId}/events/${id}`, { method: 'DELETE' }); res.json({ ok: true }); return; }
      const title = String(req.body.title || '').trim(); const date = String(req.body.date || ''); const allDay = Boolean(req.body.allDay); const time = String(req.body.time || '');
      if (!title || !date) { res.status(400).json({ error: 'Podaj nazwę i datę wydarzenia.' }); return; }
      const body = allDay ? { summary: title, start: { date }, end: { date: new Date(new Date(`${date}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10) } } : { summary: title, start: { dateTime: `${date}T${time || '09:00'}:00`, timeZone: 'Europe/Warsaw' }, end: { dateTime: new Date(new Date(`${date}T${time || '09:00'}:00`).getTime() + 3600000).toISOString(), timeZone: 'Europe/Warsaw' } };
      const event = await google(token, action === 'create' ? `/calendars/${calendarId}/events` : `/calendars/${calendarId}/events/${id}`, { method: action === 'create' ? 'POST' : 'PATCH', body: JSON.stringify(body) }); res.json({ ok: true, event: eventView(event) }); return;
    }
    const [calendarData, eventData] = await Promise.all([google(token, '/users/me/calendarList?minAccessRole=reader'), google(token, `/calendars/${encodeURIComponent(selected)}/events?timeMin=${encodeURIComponent(new Date().toISOString())}&timeMax=${encodeURIComponent(new Date(Date.now() + 7 * 86400000).toISOString())}&singleEvents=true&orderBy=startTime&maxResults=25`)]);
    res.json({ connected: true, calendarId: selected, calendars: (calendarData.items || []).map((item) => ({ id: item.id, summary: item.summary || 'Bez nazwy' })), events: (eventData.items || []).map(eventView) });
  } catch (error) { res.status(400).json({ connected: false, events: [], calendars: [], error: error.message }); }
};
