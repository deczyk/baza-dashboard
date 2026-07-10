const webpush = require('web-push');

const HABITS = [
  { id:'h1', period:'Rano', text:'Bez telefonu pierwsze 20-30 min' },
  { id:'h2', period:'Rano', text:'Szklanka wody po przebudzeniu' },
  { id:'h3', period:'Rano', text:'Śniadanie + ew. kawa czarna' },
  { id:'h4', period:'Rano', text:'Mycie twarzy + zębów' },
  { id:'h5', period:'Rano', text:'Rozciąganie klatki/pleców (2 min)' },
  { id:'h6', period:'Rano', text:'Naturalne światło / spacer rano (5-10 min)' },
  { id:'h7', period:'Dzień', text:'Izometria dłoni na ścianie (60 sek.)' },
  { id:'h8', period:'Dzień', text:'Sprawdzenie postawy (barki w tył)' },
  { id:'h10', period:'Wieczór', text:'Mycie twarzy + zębów' },
  { id:'h11', period:'Wieczór', text:'Blok bez telefonu przed snem' },
  { id:'h12', period:'Wieczór', text:'Stała pora snu (22:00)' },
  { id:'h13', period:'Wieczór', text:'5 min ciszy + krótki przegląd dnia (3 zdania)' },
];

module.exports = async function handler(req, res) {
  // Weryfikacja że to Vercel Cron woła tę funkcję, nie ktoś obcy
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const periodParam = req.query.period; // 'rano' | 'dzien' | 'wieczor'
  const PERIOD_MAP = { rano: 'Rano', dzien: 'Dzień', wieczor: 'Wieczór' };
  const period = PERIOD_MAP[periodParam];
  if (!period) {
    res.status(400).json({ error: 'Nieznany period' });
    return;
  }
  const BIN_ID = process.env.JSONBIN_BIN_ID;
  const API_KEY = process.env.JSONBIN_API_KEY;

  webpush.setVapidDetails(
    'mailto:kontakt@sklepzastodola.pl',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  try {
    const r = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': API_KEY }
    });
    const json = await r.json();
    const data = json.record || {};

    const today = new Date().toISOString().slice(0, 10);
    const doneToday = (data.habits && data.habits.date === today) ? data.habits.done : {};

    const remaining = HABITS.filter(h => h.period === period && !doneToday[h.id]);

    if (remaining.length === 0) {
      res.status(200).json({ skipped: true, reason: 'Wszystko już zrobione w tym okresie' });
      return;
    }

    const subscriptions = data.pushSubscriptions || [];
    if (subscriptions.length === 0) {
      res.status(200).json({ skipped: true, reason: 'Brak zapisanych subskrypcji' });
      return;
    }

    const payload = JSON.stringify({
      title: `${period} — ${remaining.length} do zrobienia`,
      body: remaining.map(h => h.text).join(', '),
      url: '/',
      tag: 'baza-habits-' + period
    });

    const results = await Promise.allSettled(
      subscriptions.map(sub => webpush.sendNotification(sub, payload))
    );

    res.status(200).json({ sent: results.length, remaining: remaining.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
