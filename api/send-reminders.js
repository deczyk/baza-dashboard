const webpush = require('web-push');
const store = require('./_supabase-store');

const HABITS = [
  { id:'h1', period:'Rano', text:'Bez telefonu pierwsze 20-30 min' },
  { id:'h2', period:'Rano', text:'Szklanka wody po przebudzeniu' },
  { id:'h3', period:'Rano', text:'Mycie twarzy + zębów' },
  { id:'h4', period:'Rano', text:'Zasłanie łóżka' },
  { id:'h5', period:'Rano', text:'Otworzenie okna / świeże powietrze (1-2 min)' },
  { id:'h6', period:'Rano', text:'Naturalne światło / spacer rano (5-10 min)' },
  { id:'h7', period:'Rano', text:'Rozciąganie klatki i pleców (2 min)' },
  { id:'h8', period:'Rano', text:'10 przysiadów albo 10 pompek przy ścianie' },
  { id:'h9', period:'Rano', text:'Krótki plan dnia: 3 najważniejsze rzeczy' },
  { id:'h10', period:'Rano', text:'Śniadanie + ew. kawa czarna' },
  { id:'h11', period:'Dzień', text:'Wypij wodę do południa' },
  { id:'h12', period:'Dzień', text:'Wstań i przejdź się (co godzinę)' },
  { id:'h13', period:'Dzień', text:'Zasada 20-20-20 (oczy co 20 min)' },
  { id:'h14', period:'Dzień', text:'Sprawdzenie postawy: barki w tył, szyja luźna' },
  { id:'h15', period:'Dzień', text:'Izometria dłoni na ścianie (60 sek.)' },
  { id:'h16', period:'Dzień', text:'5 minut spaceru po jedzeniu' },
  { id:'h17', period:'Dzień', text:'1 porcja warzyw lub owoców' },
  { id:'h18', period:'Dzień', text:'Trening (Push/Pull/Nogi)', days:[1,2,3,5,6] },
  { id:'h19', period:'Dzień', text:'Shake białkowy', days:[2,4,6] },
  { id:'h20', period:'Dzień', text:'5 minut porządków przy biurku' },
  { id:'h21', period:'Dzień', text:'1 głęboki oddech / minuta ciszy w ciągu dnia' },
  { id:'h22', period:'Wieczór', text:'15-20 min czytania / nauki' },
  { id:'h23', period:'Wieczór', text:'Mycie twarzy + zębów' },
  { id:'h24', period:'Wieczór', text:'Blok bez telefonu przed snem' },
  { id:'h25', period:'Wieczór', text:'Rozciąganie spokojne (3-5 min)' },
  { id:'h26', period:'Wieczór', text:'Przygotowanie rzeczy na jutro' },
  { id:'h27', period:'Wieczór', text:'Krótki przegląd dnia: 3 zdania' },
  { id:'h28', period:'Wieczór', text:'1 rzecz, z której jesteś zadowolony' },
  { id:'h29', period:'Wieczór', text:'Stała pora snu (22:00)' },
  { id:'h30', period:'Wieczór', text:'Zgaś mocne światła 30 min przed snem' },
  { id:'h31', period:'Wieczór', text:'5 min ciszy / oddechu przed snem' },
  { id:'h32', period:'Sport', text:'1 krótki spacer dziennie' },
  { id:'h33', period:'Sport', text:'1 mini-seria ruchu: przysiady, pompki, plank' },
  { id:'h34', period:'Sport', text:'1 dzień bez długiego siedzenia bez przerw' },
  { id:'h35', period:'Sport', text:'Notatka o energii: jak się czułeś po ruchu' },
  { id:'h36', period:'Sport', text:'1 mały cel tygodniowy (np. 3 treningi, 5 spacerów)' },
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
    const { record: data } = await store.getLatest();

    const today = new Date().toISOString().slice(0, 10);
    const doneToday = (data.habits && data.habits.date === today) ? data.habits.done : {};

    const dow = new Date().getDay();
    const todayHabits = HABITS.filter(h => !h.days || h.days.includes(dow));
    const remaining = todayHabits.filter(h => h.period === period && !doneToday[h.id]);

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
