// api/debrain-memory.js — wspólna pamięć Debraina, przez Supabase (darmowe na zawsze w rozsądnym
// zakresie użycia — bez miesięcznego limitu zapytań, w przeciwieństwie do jsonbin.io).
// Używa tej samej tabeli `debrain_store`, którą już masz przygotowaną dla Codex Center
// (supabase/01_DEBRAIN_ONLINE.sql) — tylko innego wiersza (id="debrain-memory", Codex Center
// używa "main"), żeby się wzajemnie nie nadpisywały.
//
// Env vary w Vercel (te same, których już używa api/codex-tasks.js):
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY albo SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORE_ID = "debrain-memory";

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function loadStore() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/debrain_store?id=eq.${encodeURIComponent(STORE_ID)}&select=data,version`,
    { headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` } }
  );
  if (!response.ok) throw new Error(`Supabase GET ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  if (!rows.length) {
    // Pierwsze użycie — wiersz "debrain-memory" jeszcze nie istnieje, tworzymy go.
    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/debrain_store`, {
      method: "POST",
      headers: {
        apikey: SECRET, Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json", Prefer: "return=representation,resolution=ignore-duplicates",
      },
      body: JSON.stringify({ id: STORE_ID, data: {}, version: 1 }),
    });
    if (!insertResp.ok) throw new Error(`Supabase INSERT ${insertResp.status}: ${await insertResp.text()}`);
    return { data: {}, version: 1 };
  }
  return { data: rows[0].data || {}, version: Number(rows[0].version || 1) };
}

async function saveStore(expectedVersion, data) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_debrain_store`, {
    method: "POST",
    headers: {
      apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_id: STORE_ID, p_expected_version: expectedVersion, p_data: data }),
  });
  if (!response.ok) throw new Error(`Supabase SAVE ${response.status}: ${await response.text()}`);
  const result = await response.json();
  const row = Array.isArray(result) ? result[0] : result;
  return Boolean(row && row.ok);
}

function withDefaults(data) {
  data.folders = data.folders || {};
  data.chats = data.chats || {};
  data.activeChatId = data.activeChatId || null;
  data.lastGreetingDate = data.lastGreetingDate || null;
  data.vault = data.vault || {};
  data.memory = data.memory || {};
  return data;
}

async function mutate(mutator) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const store = await loadStore();
    const data = withDefaults(structuredClone(store.data || {}));
    const result = mutator(data);
    if (await saveStore(store.version, data)) return result;
  }
  throw new Error("Konflikt wersji danych po 5 próbach — spróbuj ponownie.");
}

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SECRET) {
    res.status(200).json({ error: "Pamięć nieskonfigurowana (brak SUPABASE_URL / SUPABASE_SECRET_KEY)." });
    return;
  }

  if (req.method === "GET") {
    const store = await loadStore();
    const data = withDefaults(store.data || {});
    const folders = Object.entries(data.folders).map(([id, f]) => ({ id, name: f.name }));
    const chats = Object.entries(data.chats).map(([id, c]) => ({
      id, title: c.title, folderId: c.folder_id || null, updated: c.updated,
    }));
    res.status(200).json({ folders, chats, activeChatId: data.activeChatId });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { action, payload } = req.body || {};
  const p = payload || {};

  try {
    switch (action) {
      case "getChat": {
        const store = await loadStore();
        const data = withDefaults(store.data || {});
        const chat = data.chats[p.chatId];
        if (!chat) { res.status(404).json({ error: "Nie znaleziono rozmowy." }); return; }
        res.status(200).json({ id: p.chatId, title: chat.title, folderId: chat.folder_id || null, history: chat.history || [] });
        return;
      }

      case "createChat": {
        const id = newId();
        const now = new Date().toISOString();
        await mutate((data) => {
          data.chats[id] = { title: p.title || "Nowa rozmowa", folder_id: p.folderId || null, history: [], created: now, updated: now };
          data.activeChatId = id;
        });
        res.status(200).json({ id });
        return;
      }

      case "deleteChat": {
        const activeChatId = await mutate((data) => {
          delete data.chats[p.chatId];
          if (data.activeChatId === p.chatId) {
            const remaining = Object.keys(data.chats);
            data.activeChatId = remaining[0] || null;
          }
          return data.activeChatId;
        });
        res.status(200).json({ ok: true, activeChatId });
        return;
      }

      case "renameChat": {
        await mutate((data) => { if (data.chats[p.chatId]) data.chats[p.chatId].title = p.title; });
        res.status(200).json({ ok: true });
        return;
      }

      case "moveChat": {
        await mutate((data) => { if (data.chats[p.chatId]) data.chats[p.chatId].folder_id = p.folderId || null; });
        res.status(200).json({ ok: true });
        return;
      }

      case "createFolder": {
        const id = newId();
        await mutate((data) => { data.folders[id] = { name: p.name }; });
        res.status(200).json({ id });
        return;
      }

      case "deleteFolder": {
        await mutate((data) => {
          delete data.folders[p.folderId];
          Object.values(data.chats).forEach((c) => { if (c.folder_id === p.folderId) c.folder_id = null; });
        });
        res.status(200).json({ ok: true });
        return;
      }

      case "renameFolder": {
        await mutate((data) => { if (data.folders[p.folderId]) data.folders[p.folderId].name = p.name; });
        res.status(200).json({ ok: true });
        return;
      }

      case "setActive": {
        await mutate((data) => { data.activeChatId = p.chatId; });
        res.status(200).json({ ok: true });
        return;
      }

      case "saveChatHistory": {
        const title = await mutate((data) => {
          const chat = data.chats[p.chatId];
          if (chat) {
            chat.history = p.history || [];
            chat.updated = new Date().toISOString();
            if (!chat.title || chat.title === "Nowa rozmowa") {
              const firstUser = chat.history.find((m) => m.role === "user");
              if (firstUser) {
                const t = firstUser.content.trim().replace(/\n/g, " ");
                chat.title = t.length > 42 ? t.slice(0, 42) + "…" : t;
              }
            }
            return chat.title;
          }
          return null;
        });
        res.status(200).json({ ok: true, title });
        return;
      }

      case "getGreetingStatus": {
        const store = await loadStore();
        const data = withDefaults(store.data || {});
        res.status(200).json({ lastGreetingDate: data.lastGreetingDate });
        return;
      }

      case "setGreetingDate": {
        await mutate((data) => { data.lastGreetingDate = p.date; });
        res.status(200).json({ ok: true });
        return;
      }

      // ---------- Skarbiec (vault) ----------
      case "vaultList": {
        const store = await loadStore();
        const data = withDefaults(store.data || {});
        res.status(200).json({ files: Object.keys(data.vault) });
        return;
      }
      case "vaultRead": {
        const store = await loadStore();
        const data = withDefaults(store.data || {});
        res.status(200).json({ content: data.vault[p.filename] ?? null });
        return;
      }
      case "vaultWrite": {
        await mutate((data) => { data.vault[p.filename] = p.content; });
        res.status(200).json({ ok: true });
        return;
      }
      case "vaultDelete": {
        await mutate((data) => { delete data.vault[p.filename]; });
        res.status(200).json({ ok: true });
        return;
      }

      // ---------- Trwałe lekcje (memory) ----------
      case "memoryList": {
        const store = await loadStore();
        const data = withDefaults(store.data || {});
        res.status(200).json({ files: Object.keys(data.memory) });
        return;
      }
      case "memoryRead": {
        const store = await loadStore();
        const data = withDefaults(store.data || {});
        res.status(200).json({ content: data.memory[p.filename] ?? null });
        return;
      }
      case "memoryWrite": {
        await mutate((data) => { data.memory[p.filename] = p.content; });
        res.status(200).json({ ok: true });
        return;
      }
      case "memoryDelete": {
        await mutate((data) => { delete data.memory[p.filename]; });
        res.status(200).json({ ok: true });
        return;
      }

      default:
        res.status(400).json({ error: "Nieznana akcja." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
