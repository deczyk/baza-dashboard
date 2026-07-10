const { Resend } = require('resend');

const HABITS = [
  { id:'h1', period:'Rano', text:'Bez telefonu pierwsze 20-30 min' },
  { id:'h2', period:'Rano', text:'Szklanka wody po przebudzeniu' },
  { id:'h3', period:'Rano', text:'Śniadanie + ew. kawa czarna' },
  { id:'h4', period:'Rano', text:'Mycie twarzy + zębów' },
  { id:'h5', period:'Rano', text:'Rozciąganie klatki/pleców (2 min)' },
  { id:'h6', period:'Rano', text:'Naturalne światło / spacer rano (5-10 min)' },
  { id:'h7', period:'Dzień', text:'Izometria dłoni na ścianie (60 sek.)' },
  { id:'h8', period:'Dzień', text:'Sprawdzenie postawy (barki w tył)' },
  { id:'h14', period:'Dzień', text:'Trening (Push/Pull/Nogi)' },
  { id:'h10', period:'Wieczór', text:'Mycie twarzy + zębów' },
  { id:'h11', period:'Wieczór', text:'Blok bez telefonu przed snem' },
  { id:'h12', period:'Wieczór', text:'Stała pora snu (22:00)' },
  { id:'h13', period:'Wieczór', text:'5 min ciszy + krótki przegląd dnia (3 zdania)' },
];

module.exports = async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const BIN_ID = process.env.JSONBIN_BIN_ID;
  const API_KEY = process.env.JSONBIN_API_KEY;
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const r = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: { 'X-Master-Key': API_KEY }
    });
    const json = await r.json();
    const data = json.record || {};
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
