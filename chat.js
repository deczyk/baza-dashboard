// api/chat.js — Debrain backend (Vercel Serverless Function, CommonJS)
// Wymaga zmiennych środowiskowych w Vercel:
//   DEEPSEEK_API_KEY   — klucz z platform.deepseek.com
//   DEBRAIN_DOMAIN     — domena, na której stoi Baza (np. "decz.pl"), do odczytu danych Bazy

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat"; // DeepSeek V3.2

const SYSTEM_PROMPT = `Jesteś Debrain — osobisty agent AI Kuby, dostępny przez panel webowy na decz.pl.
Mówisz po polsku, zwięźle i konkretnie, dajesz gotowe rozwiązania. Masz narzędzia: web_search (aktualne
informacje z sieci) i read_baza_data (odczyt danych z dashboardu Kuby "Baza" — nawyki, zadania, priorytet
dnia, notatki, streak, XP). Używaj ich proaktywnie, kiedy pytanie tego wymaga, zamiast zgadywać.`;

const TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Szuka aktualnych informacji w internecie (DuckDuckGo).",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Zapytanie do wyszukania" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_baza_data",
      description: "Czyta aktualne dane z dashboardu Baza: priorytet dnia, zadania do zrobienia, listę zakupów, postęp nawyków dzisiaj, streak, XP, ostatnie notatki.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function webSearch(query) {
  try {
    const resp = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
      body: new URLSearchParams({ q: query }),
    });
    const html = await resp.text();
    const results = [];
    const blockRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let match, count = 0;
    while ((match = blockRegex.exec(html)) !== null && count < 5) {
      const stripTags = (s) => s.replace(/<[^>]+>/g, "").trim();
      results.push({ url: match[1], title: stripTags(match[2]), snippet: stripTags(match[3]) });
      count++;
    }
    return results.length ? JSON.stringify(results) : "Brak wyników.";
  } catch (e) {
    return "Błąd wyszukiwania: " + e.message;
  }
}

async function readBazaData() {
  const domain = process.env.DEBRAIN_DOMAIN || "decz.pl";
  try {
    const r = await fetch(`https://${domain}/api/baza-data`);
    if (!r.ok) return `Błąd odczytu Baza (status ${r.status}).`;
    const data = await r.json();
    const summary = {
      priorytet_dnia: data.priority || null,
      zadania: data.todos || [],
      lista_zakupow: data.shoppingList || [],
      nawyki_dzis: data.habits || null,
      streak_dni: data.streak ? data.streak.count : null,
      xp: data.xp || 0,
      ostatnie_notatki: (data.notes || []).slice(0, 5),
    };
    return JSON.stringify(summary);
  } catch (e) {
    return "Błąd odczytu danych Baza: " + e.message;
  }
}

const TOOL_IMPL = {
  web_search: (args) => webSearch(args.query),
  read_baza_data: () => readBazaData(),
};

async function callDeepSeek(messages) {
  const resp = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS_SCHEMA, temperature: 0.4 }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API error ${resp.status}: ${errText}`);
  }
  return resp.json();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { history } = req.body;
    let messages = [{ role: "system", content: SYSTEM_PROMPT }, ...(history || [])];
    let finalContent = null;

    for (let i = 0; i < 5 && finalContent === null; i++) {
      const data = await callDeepSeek(messages);
      const choice = data.choices[0].message;
      messages.push(choice);

      if (!choice.tool_calls) {
        finalContent = choice.content;
        break;
      }

      for (const tc of choice.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const impl = TOOL_IMPL[tc.function.name];
        const result = impl ? await impl(args) : "Nieznane narzędzie";
        messages.push({ role: "tool", tool_call_id: tc.id, content: String(result).slice(0, 6000) });
      }
    }

    res.status(200).json({
      reply: finalContent || "⚠️ Nie udało się uzyskać odpowiedzi.",
      history: messages.filter((m) => m.role !== "system"),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
