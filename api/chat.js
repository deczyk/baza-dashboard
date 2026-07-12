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
- search_vault, read_vault_note, write_vault_note, list_vault_notes — Twój skarbiec notatek (ten sam co
  w wersji desktopowej, wspólny magazyn)
- sync_baza_notes_to_vault — kopiuje notatki z Bazy do skarbca
- list_memory, read_memory, write_memory, delete_memory — Twoje trwałe, destylowane lekcje (osobne od
  skarbca — to Twoje wnioski o pracy z Kubą, nie jego surowa wiedza)
Czasem dostaniesz w wiadomości tekst oznaczony jako odczytany z OCR ze zrzutu ekranu — to wyekstrahowany
tekst, nie pełne widzenie obrazu, więc traktuj go jak dowolny inny tekst do analizy, nie zakładaj że widziałeś
układ graficzny czy kolory.
Używaj narzędzi proaktywnie, kiedy pytanie/prośba tego wymaga, zamiast zgadywać. Przy zapisie danych (update_baza_data,
create_calendar_event) wykonaj akcję i potwierdź krótko, po swojemu, co zostało zrobione.

TRWAŁE LEKCJE (protokół Napisz-Skonsoliduj-Przypomnij-Zastosuj): masz magazyn "memory" na destylowane,
długoterminowe lekcje — osobny od transkryptu czatu. To nie jest miejsce na notatki z każdej rozmowy, tylko
na rzeczy realnie warte zapamiętania: coś co zajęło dużo czasu odkryć, poprawkę błędnego założenia,
potwierdzone podejście.
- NAPISZ (kiedy Kuba poprosi "zapisz to na przyszłość" albo pod koniec wartościowej sesji): zapisz przez
  write_memory plik z jednolinijkowym podsumowaniem na górze. Sprawdź najpierw przez list_memory/read_memory
  czy już tego nie ma.
- SKONSOLIDUJ (kiedy Kuba poprosi "skonsoliduj pamięć"): przejrzyj wszystkie przez list_memory, połącz
  duplikaty w gęstsze pliki, usuń przez delete_memory te nieaktualne/błędne.
- PRZYPOMNIJ (na starcie zadania, które może mieć związek z czymś zapisanym): list_memory, potem read_memory
  tylko na tym co wygląda istotnie, jawnie powiedz co znalazłeś albo że nic nie pasuje.
- ZASTOSUJ: przypomniana lekcja ma faktycznie zmienić Twoje podejście, nie tylko zostać wspomniana.
Nigdy nie rób tego automatycznie bez wyraźnej prośby.

SKARBIEC (vault): surowe notatki Kuby, nie destylowane lekcje. Możesz tam pisać (write_vault_note) i czytać
(search_vault, read_vault_note). Używaj search_vault kiedy Kuba pyta co kiedyś pisał/notował o czymś.

DORADZTWO MODELU: masz dwa tryby — deepseek-chat (szybki, domyślny) i deepseek-reasoner (wolniejszy,
droższy, ale znacznie mocniejszy w wieloetapowym rozumowaniu i trudnym debugowaniu). Kiedy oceniasz, że
zadanie jest złożone, wieloetapowe, wymaga głębokiego rozumowania albo precyzyjnego planowania — powiedz o
tym Kubie wprost i zasugeruj przełączenie się na deepseek-reasoner (wpisuje /reasoner). Nie proponuj tego
przy prostych, szybkich pytaniach — tylko kiedy realnie by pomogło.`;

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
          note: { type: "string", description: "Opcjonalna notatka do zadania, np. kiedy je zrobisz ('zrobię w poniedziałek', 'odłożone, spróbuj jutro') — tylko dla add_todo" },
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
  {
    type: "function",
    function: {
      name: "search_vault",
      description: "Przeszukuje treść wszystkich notatek w skarbcu — jak wyszukiwarka po własnej bazie wiedzy.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Czego szukać" },
          max_results: { type: "integer", description: "Maksymalna liczba dopasowań (domyślnie 8)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_vault_note",
      description: "Czyta pełną treść jednej notatki ze skarbca.",
      parameters: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] },
    },
  },
  {
    type: "function",
    function: {
      name: "write_vault_note",
      description: "Zapisuje/nadpisuje notatkę w skarbcu.",
      parameters: {
        type: "object",
        properties: { filename: { type: "string" }, content: { type: "string" } },
        required: ["filename", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_vault_notes",
      description: "Listuje nazwy wszystkich notatek w skarbcu.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "sync_baza_notes_to_vault",
      description: "Kopiuje notatki z zakładki Notatki w Bazie do skarbca.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_memory",
      description: "Listuje nazwy wszystkich zapisanych trwałych lekcji.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_memory",
      description: "Czyta treść jednej zapisanej lekcji.",
      parameters: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] },
    },
  },
  {
    type: "function",
    function: {
      name: "write_memory",
      description: "Zapisuje nową trwałą lekcję.",
      parameters: {
        type: "object",
        properties: { filename: { type: "string" }, content: { type: "string" } },
        required: ["filename", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_memory",
      description: "Usuwa lekcję (np. podczas konsolidacji, gdy jest nieaktualna albo zduplikowana).",
      parameters: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] },
    },
  },
  {
    type: "function", function: { name: "suggest_user_observation", description: "Zapisuje niepewną sugestię dotyczącą preferencji lub osobowości użytkownika do późniejszego zatwierdzenia. Używaj tylko przy wyraźnym lub powtarzalnym wzorcu.", parameters: { type: "object", properties: { text: {type:"string"}, category:{type:"string"}, evidence:{type:"string"}, confidence:{type:"number"} }, required:["text"] } }
  },
  {
    type: "function",
    function: {
      name: "remember_knowledge_entry",
      description: "Zapisuje ważne, potwierdzone ustalenie do wspólnej pamięci desktop/decz.pl. Używaj dla jasnych decyzji, faktów, statusów, zasad, preferencji, celów i ryzyk.",
      parameters: {
        type: "object",
        properties: {
          category: { type:"string", enum:["DECYZJA","FAKT","STATUS","ZASADA","PREFERENCJA","CEL","RYZYKO","DO POTWIERDZENIA"] },
          text: { type:"string" },
          source: { type:"string" },
          confidence: { type:"number" },
          active: { type:"boolean" }
        },
        required:["category","text"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_knowledge_entries",
      description: "Czyta wspólną pamięć decyzji, faktów, statusów, zasad, preferencji, celów i ryzyk.",
      parameters: { type:"object", properties:{ category:{type:"string"}, active_only:{type:"boolean"} } }
    }
  },

];

// ---------- web_search ----------
async function searchSerper(query) {
  const resp = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 5 }),
  });
  if (!resp.ok) throw new Error(`Serper status ${resp.status}`);
  const data = await resp.json();
  return (data.organic || []).slice(0, 5).map((item) => ({
    title: item.title || "",
    snippet: item.snippet || "",
    url: item.link || "",
  }));
}

async function searchDuckDuckGo(query) {
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
  return results;
}

async function webSearch(query) {
  try {
    let results = [];
    if (process.env.SERPER_API_KEY) {
      try {
        results = await searchSerper(query);
      } catch (e) {
        results = []; // spadnij do DuckDuckGo
      }
    }
    if (results.length === 0) {
      results = await searchDuckDuckGo(query);
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
        data.todos.unshift({ text: args.text, done: false, id: Date.now(), date: now, note: args.note || undefined });
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

// ---------- Skarbiec (vault) i trwałe lekcje (memory) — przez ten sam magazyn co api/debrain-memory.js ----------

async function memoryStoreAction(action, payload) {
  const r = await fetch(`https://${bazaDomain()}/api/debrain-memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload: payload || {} }),
  });
  return r.json();
}

async function toolSearchVault(query, max_results = 8) {
  try {
    const listRes = await memoryStoreAction("vaultList", {});
    const files = listRes.files || [];
    const results = [];
    for (const filename of files) {
      const readRes = await memoryStoreAction("vaultRead", { filename });
      const content = readRes.content || "";
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(query.toLowerCase())) {
          const snippet = lines.slice(Math.max(0, i - 1), i + 2).join("\n").trim();
          results.push({ plik: filename, fragment: snippet.slice(0, 400) });
          if (results.length >= max_results) break;
        }
      }
      if (results.length >= max_results) break;
    }
    return results.length ? JSON.stringify(results) : `Brak wyników dla '${query}' w skarbcu.`;
  } catch (e) {
    return "Błąd przeszukiwania skarbca: " + e.message;
  }
}

async function toolReadVaultNote(filename) {
  const res = await memoryStoreAction("vaultRead", { filename });
  return res.content !== null && res.content !== undefined ? res.content : `Nie znaleziono notatki: ${filename}`;
}

async function toolWriteVaultNote(filename, content) {
  await memoryStoreAction("vaultWrite", { filename, content });
  return `Zapisano notatkę: ${filename}`;
}

async function toolListVaultNotes() {
  const res = await memoryStoreAction("vaultList", {});
  return JSON.stringify(res.files || []);
}

async function toolSyncBazaNotesToVault() {
  try {
    const data = await fetchBazaData();
    const notes = data.notes || [];
    if (!notes.length) return "Brak notatek w Bazie do zsynchronizowania.";
    let count = 0;
    for (const n of notes) {
      const body = (n.body || "").trim();
      if (!body) continue;
      const date = (n.date || "").slice(0, 10);
      const filename = `baza-notatki/${date}-${n.id}.md`;
      await memoryStoreAction("vaultWrite", { filename, content: `# Notatka z Bazy (${date})\n\n${body}\n` });
      count++;
    }
    return `Zsynchronizowano ${count} notatek do skarbca.`;
  } catch (e) {
    return "Błąd synchronizacji notatek: " + e.message;
  }
}

async function toolListMemory() {
  const res = await memoryStoreAction("memoryList", {});
  return JSON.stringify(res.files || []);
}

async function toolReadMemory(filename) {
  const res = await memoryStoreAction("memoryRead", { filename });
  return res.content !== null && res.content !== undefined ? res.content : `Nie znaleziono lekcji: ${filename}`;
}

async function toolWriteMemory(filename, content) {
  await memoryStoreAction("memoryWrite", { filename, content });
  return `Zapisano lekcję: ${filename}`;
}

async function toolDeleteMemory(filename) {
  await memoryStoreAction("memoryDelete", { filename });
  return `Usunięto lekcję: ${filename}`;
}

const TOOL_IMPL = {
  web_search: (args) => webSearch(args.query),
  read_baza_data: () => readBazaData(),
  update_baza_data: (args) => updateBazaData(args),
  read_calendar: () => readCalendar(),
  create_calendar_event: (args) => createCalendarEvent(args),
  read_crm_data: () => readCrmData(),
  search_vault: (args) => toolSearchVault(args.query, args.max_results),
  read_vault_note: (args) => toolReadVaultNote(args.filename),
  write_vault_note: (args) => toolWriteVaultNote(args.filename, args.content),
  list_vault_notes: () => toolListVaultNotes(),
  sync_baza_notes_to_vault: () => toolSyncBazaNotesToVault(),
  list_memory: () => toolListMemory(),
  read_memory: (args) => toolReadMemory(args.filename),
  write_memory: (args) => toolWriteMemory(args.filename, args.content),
  delete_memory: (args) => toolDeleteMemory(args.filename),
  suggest_user_observation: (args) => memoryStoreAction("profileAddSuggestion", args).then(r => JSON.stringify(r)),
  remember_knowledge_entry: (args) => memoryStoreAction("knowledgeUpsert", {entry:args}).then(r => JSON.stringify(r)),
  list_knowledge_entries: (args) => memoryStoreAction("knowledgeList", {category:args.category||"",activeOnly:args.active_only!==false}).then(r => JSON.stringify(r.entries||[])),
};

function normalizeMessages(messages) {
  const raw = (messages || []).filter(m => ["system","user","assistant","tool"].includes(m.role)).map(m => {
    const x = { role: m.role, content: m.content == null ? "" : m.content };
    for (const k of ["tool_calls","tool_call_id","name","reasoning_content"]) if (m[k] != null) x[k] = m[k];
    return x;
  });
  const out=[];
  for(let i=0;i<raw.length;){
    const m=raw[i];
    if(m.role==="assistant" && m.tool_calls){
      const expected=m.tool_calls.map(t=>t.id).filter(Boolean), tools=[]; let j=i+1;
      while(j<raw.length && raw[j].role==="tool"){tools.push(raw[j]);j++;}
      const got=new Set(tools.map(t=>t.tool_call_id));
      if(expected.length && expected.every(id=>got.has(id))){out.push(m,...tools);}
      i=j; continue;
    }
    if(m.role!=="tool") out.push(m);
    i++;
  }
  return out;
}

async function callDeepSeek(messages, model) {
  const payload = { model, messages: normalizeMessages(messages), tools: TOOLS_SCHEMA };
  if (model !== "deepseek-reasoner") payload.temperature = 0.4;
  const resp = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
  });

  try {
    const { history, model: requestedModel, chatId, hidden } = req.body;
    const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;
    let profile = null;
    let knowledgeEntries = [];
    try { profile = (await memoryStoreAction("profileGet", {})).profile; } catch (_) {}
    try { knowledgeEntries = (await memoryStoreAction("knowledgeList", {activeOnly:true})).entries || []; } catch (_) {}
    const profileContext = profile ? `\n\nPROFIL UŻYTKOWNIKA (zatwierdzone dane):\n${JSON.stringify({basic:profile.basic,communication:profile.communication,workStyle:profile.workStyle,likes:profile.likes,dislikes:profile.dislikes,motivators:profile.motivators,approvedObservations:profile.approvedObservations}, null, 2)}\nUCZENIE: nie uznawaj pojedynczej wypowiedzi za stałą cechę. Przy wyraźnym lub powtarzalnym wzorcu użyj suggest_user_observation.` : "";
    const knowledgeContext = `\n\nPAMIĘĆ DECYZJI, FAKTÓW I USTALEŃ (obowiązujące wpisy):\n${JSON.stringify(knowledgeEntries.slice(0,80).map(x=>({category:x.category,text:x.text,confidence:x.confidence,source:x.source})), null, 2)}\nZASADA: nowe wpisy zapisuj przez remember_knowledge_entry tylko przy jasnym ustaleniu. Niepewne informacje oznaczaj jako DO POTWIERDZENIA.`;
    let messages = [{ role: "system", content: SYSTEM_PROMPT + profileContext + knowledgeContext }, ...(history || [])];
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
        res.write(JSON.stringify({ type: "tool_start", name: tc.function.name, args }) + "\n");
        const impl = TOOL_IMPL[tc.function.name];
        const result = impl ? await impl(args) : "Nieznane narzędzie";
        messages.push({ role: "tool", tool_call_id: tc.id, content: String(result).slice(0, 6000) });
        res.write(JSON.stringify({ type: "tool_end", name: tc.function.name }) + "\n");
      }
    }

    const rawHistory = messages.filter((m) => m.role !== "system");
    // Jeśli to ukryte polecenie (np. codzienne powitanie) — zapisujemy do pamięci TYLKO czystą
    // odpowiedź asystenta, bez samego triggera i bez śmieci narzędziowych, żeby po ponownym
    // otwarciu czatu nie pojawiło się jako widoczna wiadomość "TY".
    const updatedHistory = hidden
      ? [...(history || []).slice(0, -1), { role: "assistant", content: finalContent }]
      : rawHistory;

    // Zapis do wspólnego magazynu (ten sam bin, którego używa desktop przy włączonej synchronizacji)
    if (chatId) {
      try {
        await fetch(`https://${req.headers.host}/api/debrain-memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "saveChatHistory", payload: { chatId, history: updatedHistory } }),
        });
      } catch (e) {
        // Nie blokujemy odpowiedzi, jeśli sam zapis pamięci się nie uda
      }
    }

    res.write(JSON.stringify({
      type: "final",
      reply: finalContent || "⚠️ Nie udało się uzyskać odpowiedzi.",
      history: updatedHistory,
      model,
    }) + "\n");
    res.end();
  } catch (err) {
    res.write(JSON.stringify({ type: "final", error: err.message }) + "\n");
    res.end();
  }
};
