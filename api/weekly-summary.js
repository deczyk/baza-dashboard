const { Resend } = require('resend');
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
  { id:'h18', period:'Dzień', text:'Trening (Push/Pull/Nogi)' },
  { id:'h19', period:'Dzień', text:'Shake białkowy' },
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
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { record: data } = await store.getLatest();
    const history = data.habitHistory || {};

    // Ostatnie 7 dni (łącznie z dziś)
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      let record = history[key];
      if (key === new Date().toISOString().slice(0,10) && data.habits && data.habits.date === key) {
        const doneCount = HABITS.filter(h => data.habits.done[h.id]).length;
        record = { done: doneCount, total: HABITS.length };
      }
      days.push({ date: key, done: record?.done || 0, total: record?.total || HABITS.length });
    }

    const totalDone = days.reduce((s, d) => s + d.done, 0);
    const totalPossible = days.reduce((s, d) => s + d.total, 0);
    const pct = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;
    const streak = data.streak?.count || 0;
    const xp = data.xp || 0;
    const level = Math.floor(xp / 100) + 1;

    const rows = days.map(d => `<tr><td style="padding:6px 12px">${d.date}</td><td style="padding:6px 12px">${d.done}/${d.total}</td></tr>`).join('');

    const html = `
      <div style="font-family:sans-serif;background:#14181B;color:#E8E4DB;padding:24px;border-radius:12px">
        <h2 style="color:#C9A876">Podsumowanie tygodnia — Baza</h2>
        <p>Poziom <b>${level}</b> · <b>${xp} XP</b> · 🔥 streak <b>${streak}</b> dni</p>
        <p>Średnia ukończenia nawyków w tym tygodniu: <b>${pct}%</b> (${totalDone}/${totalPossible})</p>
        <table style="border-collapse:collapse;margin-top:12px;width:100%">
          ${rows}
        </table>
      </div>
    `;

    await resend.emails.send({
      from: 'Baza <onboarding@resend.dev>',
      to: process.env.SUMMARY_EMAIL_TO,
      subject: `Podsumowanie tygodnia — ${pct}% ukończenia`,
      html
    });

    res.status(200).json({ sent: true, pct });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
