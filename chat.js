// api/chat.js — Debrain backend (Vercel Serverless Function, CommonJS)
// Wymaga zmiennej środowiskowej DEEPSEEK_API_KEY ustawionej w Vercel Settings.

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat"; // DeepSeek V3.2

const SYSTEM_PROMPT = `Jesteś Debrain — osobisty agent AI Kuby, dostępny przez panel webowy.
Mówisz po polsku, zwięźle i konkretnie, dajesz gotowe rozwiązania. Masz narzędzie web_search —
używaj go, gdy potrzebujesz aktualnych informacji, zamiast zgadywać.`;

const TOOLS_SCHEMA = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Szuka aktualnych informacji w internecie (DuckDuckGo).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Zapytanie do wyszukania" },
        },
        required: ["query"],
      },
    },
  },
];

async function webSearch(query) {
  try {
    const resp = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
      },
      body: new URLSearchParams({ q: query }),
    });
    const html = await resp.text();

    // Prosty regex-based scraping wyników (bez cheerio, żeby nie dodawać zależności)
    const results = [];
    const blockRegex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let match;
    let count = 0;
    while ((match = blockRegex.exec(html)) !== null && count < 5) {
      const stripTags = (s) => s.replace(/<[^>]+>/g, "").trim();
      results.push({
        url: match[1],
        title: stripTags(match[2]),
        snippet: stripTags(match[3]),
      });
      count++;
    }
    return results.length ? JSON.stringify(results) : "Brak wyników.";
  } catch (e) {
    return "Błąd wyszukiwania: " + e.message;
  }
}

const TOOL_IMPL = { web_search: (args) => webSearch(args.query) };

async function callDeepSeek(messages) {
  const resp = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: TOOLS_SCHEMA,
      temperature: 0.4,
    }),
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
    const { history } = req.body; // [{role, content}, ...] z frontendu (bez system prompta)
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
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: String(result).slice(0, 6000),
        });
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
