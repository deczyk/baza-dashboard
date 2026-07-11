// api/chat.js — Debrain backend v3 (Vercel Serverless Function, CommonJS)
//
// Env vary wymagane w Vercel:
//   DEEPSEEK_API_KEY     — klucz z platform.deepseek.com
//   DEBRAIN_DOMAIN       — domena Bazy, np. "decz.pl" (domyślnie "decz.pl")
//   BAZA_PIN             — PIN Bazy, ten sam co w CONFIG.PIN w baza.html (domyślnie "5855")
//   CRM_DOMAIN            — domena CRM, np. "www.sklepzastodola.pl" (opcjonalnie, do read_crm_data)
//   CRM_API_PATH          — ścieżka API panelu CRM, np. "/api/panel-data" (SPRAWDŹ i popraw — patrz README)
//   CRM_PANEL_PASSWORD    — hasło do panelu CRM (opcjonalnie, do read_crm_data)

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";
const ALLOWED_MODELS = ["deepseek-chat", "deepseek-reasoner"];

const SYSTEM_PROMPT = `Jesteś Debrain — osobisty agent Kuby, dostępny przez panel webowy na decz.pl.

CHARAKTER: Zwracasz się do Kuby tak, jak Alfred Pennyworth zwracał się do Bruce'a Wayne'a — z nienaganną
klasą, lojalnością i spokojem, ale też z odrobiną suchego, delikatnie ironicznego humoru, kiedy sytuacja na to
pozwala. Jesteś opanowany, rzeczowy, nigdy nie jesteś przesadnie entuzjastyczny ani przymilny. Możesz pozwolić
sobie na taktowną uwagę, jeśli Kuba np. zaniedbuje nawyki albo odkłada coś na później — tak jak zrobiłby to
zaufany, doświadczony powiernik, a nie asystent korporacyjny. Zwracaj się per "Pan/Pana" w duchu tej relacji,
chyba że Kuba wyraźnie poprosi inaczej.

FORMATOWANIE: Piszesz zwykłym tekstem, bez formatowania markdown — żadnych gwiazdek (**), podkreśleń, list
numerowanych ze znacznikami itp. Jeśli chcesz wymienić kilka rzeczy, rób to w zdaniach albo z myślnikiem "-",
nigdy z ** wokół słów. Twoje odpowiedzi trafiają do zwykłego pola tekstowego, które nie renderuje markdown.

NARZĘDZIA:
- web_search — aktualne informacje z sieci
- read_baza_data — odczyt danych z dashboardu Baza (nawyki, zadania, priorytet, notatki, streak, XP, lista filmów do obejrzenia, kalorie dzisiaj)
- update_baza_data — zapis do Bazy (dodanie zadania/notatki/produktu na zakupy/filmu do obejrzenia/kalorii, odznaczenie nawyku, ustawienie priorytetu dnia)
- read_calendar — odczyt najbliższych wydarzeń z Google Calendar (podpięty w Bazie)
- create_calendar_event — dodanie wydarzenia do kalendarza
- read_crm_data — odczyt danych z CRM firmy Sklep za Stodołą (klienci, sprawy w toku, terminy, instalacje)
Czasem dostaniesz w wiadomości tekst oznaczony jako odczytany z OCR ze zrzutu ekranu — to wyekstrahowany
tekst, nie pełne widzenie obrazu, więc traktuj go jak dowolny inny tekst do analizy, nie zakładaj że widziałeś
układ graficzny czy kolory.
Używaj narzędzi proaktywnie, kiedy pytanie/prośba tego wymaga, zamiast zgadywać. Przy zapisie danych (update_baza_data,
create_calendar_event) wykonaj akcję i potwierdź krótko, po swojemu, co zostało zrobione.`;

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
      description: "Czyta aktualne dane z dashboardu Baza: priorytet dnia, zadania do zrobienia, listę zakupów, listę filmów do obejrzenia, kalorie zjedzone dzisiaj i dzienny cel, postęp nawyków dzisiaj, streak, XP, ostatnie notatki.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_baza_data",
      description: "Zapisuje coś do dashboardu Baza.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["add_todo", "add_note", "add_shopping_item", "add_watch_item", "add_calories", "set_priority", "toggle_habit"],
            description: "Rodzaj akcji do wykonania",
          },
          text: { type: "string", description: "Treść zadania / notatki / produktu / tytułu filmu / priorytetu dnia (dla add_todo, add_note, add_shopping_item, add_watch_item, set_priority)" },
          kcal: { type: "number", description: "Liczba kalorii do dodania (tylko dla add_calories)" },
          habit_id: { type: "string", description: "ID nawyku do odznaczenia (tylko dla toggle_habit, format 'hNN', np. 'h1')" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_calendar",
      description: "Czyta najbliższe wydarzenia z Google Calendar (7 dni do przodu).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Dodaje wydarzenie do Google Calendar.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Tytuł wydarzenia" },
          date: { type: "string", description: "Data w formacie YYYY-MM-DD" },
          time: { type: "string", description: "Godzina w formacie HH:MM (opcjonalnie)" },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_crm_data",
      description: "Czyta dane z CRM firmy Sklep za Stodołą: klientów, sprawy w toku, terminy, instalacje mlekomatów.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ---------- web_search ----------
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

// ---------- Baza: odczyt ----------
const bazaDomain = () => process.env.DEBRAIN_DOMAIN || "decz.pl";
const bazaPin = () => process.env.BAZA_PIN || "5855";

async function fetchBazaData() {
  const r = await fetch(`https://${bazaDomain()}/api/baza-data`, {
    headers: { "X-Panel-Password": bazaPin() },
  });
  if (!r.ok) throw new Error(`Baza API status ${r.status}`);
  return r.json();
}

async function saveBazaData(data) {
  const r = await fetch(`https://${bazaDomain()}/api/baza-data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Panel-Password": bazaPin() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`Zapis do Bazy nie powiódł się (status ${r.status})`);
}

async function readBazaData() {
  try {
    const data = await fetchBazaData();
    const summary = {
      priorytet_dnia: data.priority || null,
      zadania: data.todos || [],
      lista_zakupow: data.shoppingList || [],
      lista_filmow_do_obejrzenia: data.watchList || [],
      kalorie_dzis: data.calories || null,
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

// ---------- Baza: zapis ----------
async function updateBazaData(args) {
  try {
    const data = await fetchBazaData();
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    switch (args.action) {
      case "add_todo":
        if (!args.text) return "Brak treści zadania.";
        if (!data.todos) data.todos = [];
        data.todos.unshift({ text: args.text, done: false, id: Date.now(), date: now });
        break;
      case "add_note":
        if (!args.text) return "Brak treści notatki.";
        if (!data.notes) data.notes = [];
        data.notes.unshift({ body: args.text, id: Date.now(), date: now });
        break;
      case "add_shopping_item":
        if (!args.text) return "Brak nazwy produktu.";
        if (!data.shoppingList) data.shoppingList = [];
        data.shoppingList.unshift({ text: args.text, done: false, id: Date.now() });
        break;
      case "add_watch_item":
        if (!args.text) return "Brak tytułu filmu.";
        if (!data.watchList) data.watchList = [];
        data.watchList.unshift({ title: args.text, done: false, id: Date.now() });
        break;
      case "add_calories": {
        if (!args.kcal) return "Brak liczby kalorii.";
        if (!data.calories || data.calories.date !== today) {
          data.calories = { date: today, kcal: 0, goal: (data.calories && data.calories.goal) || 2500 };
        }
        data.calories.kcal = Math.max(0, data.calories.kcal + args.kcal);
        break;
      }
      case "set_priority":
        if (!args.text) return "Brak treści priorytetu.";
        data.priority = { text: args.text, date: today };
        break;
      case "toggle_habit": {
        if (!args.habit_id) return "Brak ID nawyku.";
        if (!data.habits || data.habits.date !== today) {
          data.habits = { date: today, done: {} };
        }
        const wasDone = !!data.habits.done[args.habit_id];
        data.habits.done[args.habit_id] = !wasDone;
        data.xp = Math.max(0, (data.xp || 0) + (wasDone ? -10 : 10));
        break;
      }
      default:
        return "Nieznana akcja.";
    }

    await saveBazaData(data);
    return `OK: wykonano "${args.action}".`;
  } catch (e) {
    return "Błąd zapisu do Bazy: " + e.message;
  }
}

// ---------- Kalendarz ----------
async function readCalendar() {
  try {
    const r = await fetch(`https://${bazaDomain()}/api/calendar-events`);
    const data = await r.json();
    if (!data.connected) return "Kalendarz Google nie jest połączony w Bazie.";
    return JSON.stringify(data.events || []);
  } catch (e) {
    return "Błąd odczytu kalendarza: " + e.message;
  }
}

async function createCalendarEvent(args) {
  try {
    const r = await fetch(`https://${bazaDomain()}/api/calendar-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: args.title, date: args.date, time: args.time || "" }),
    });
    const data = await r.json();
    if (data.error) return "Błąd: " + data.error;
    return `Dodano do kalendarza: "${args.title}" (${args.date}${args.time ? " " + args.time : ""}).`;
  } catch (e) {
    return "Błąd dodawania do kalendarza: " + e.message;
  }
}

// ---------- CRM (Sklep za Stodołą) ----------
// UWAGA: ścieżka API i mechanizm autoryzacji panelu CRM nie są znane na pewno —
// dostosuj CRM_API_PATH i nagłówek poniżej do rzeczywistego endpointu panel.html.
async function readCrmData() {
  const domain = process.env.CRM_DOMAIN;
  const path = process.env.CRM_API_PATH || "/api/panel-data";
  const password = process.env.CRM_PANEL_PASSWORD;
  if (!domain || !password) {
    return "CRM nieskonfigurowany — brak CRM_DOMAIN lub CRM_PANEL_PASSWORD w Vercel env vars.";
  }
  try {
    const r = await fetch(`https://${domain}${path}`, {
      headers: { "X-Panel-Password": password },
    });
    if (!r.ok) return `Błąd odczytu CRM (status ${r.status}) — sprawdź CRM_API_PATH.`;
    const data = await r.json();
    // Ogranicz payload do najważniejszych rzeczy, żeby nie zalać kontekstu
    const summary = {
      klienci_liczba: Array.isArray(data.clients) ? data.clients.length : undefined,
      sprawy_w_toku: data.activeCases || data.cases || undefined,
      terminy: data.deadlines || data.terminy || undefined,
      instalacje: data.installations || undefined,
    };
    return JSON.stringify(summary);
  } catch (e) {
    return "Błąd odczytu CRM: " + e.message;
  }
}

const TOOL_IMPL = {
  web_search: (args) => webSearch(args.query),
  read_baza_data: () => readBazaData(),
  update_baza_data: (args) => updateBazaData(args),
  read_calendar: () => readCalendar(),
  create_calendar_event: (args) => createCalendarEvent(args),
  read_crm_data: () => readCrmData(),
};

async function callDeepSeek(messages, model) {
  const resp = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools: TOOLS_SCHEMA, temperature: 0.4 }),
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
    const { history, model: requestedModel } = req.body;
    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;
    let messages = [{ role: "system", content: SYSTEM_PROMPT }, ...(history || [])];
    let finalContent = null;

    for (let i = 0; i < 10 && finalContent === null; i++) {
      const data = await callDeepSeek(messages, model);
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
      model,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
