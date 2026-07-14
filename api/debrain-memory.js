// api/debrain-memory.js — wspólna pamięć Debraina, przez Supabase. Wspiera PEŁNY zestaw akcji,
// których oczekuje desktopowy agent_core.py (po zmianach Codexa) — rozmowy/foldery, skarbiec (vault),
// stan dnia, CRM, porzucone sprawy, model zachowań, ustawienia, profil, trwałą wiedzę (knowledge),
// nauczone reguły (learning).
//
// Env vary w Vercel:
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY albo SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORE_ID = "debrain-memory";

function newId(prefix) {
  const raw = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix ? `${prefix}_${raw}` : raw;
}

async function loadStore() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/debrain_store?id=eq.${encodeURIComponent(STORE_ID)}&select=data,version`,
    { headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` } }
  );
  if (!response.ok) throw new Error(`Supabase GET ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  if (!rows.length) {
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
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
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
  data.dailyState = data.dailyState || {};
  data.crm = Array.isArray(data.crm) ? data.crm : [];
  data.stalledMatters = Array.isArray(data.stalledMatters) ? data.stalledMatters : [];
  data.behaviorModel = data.behaviorModel || { observations: [], updatedAt: null, version: 1 };
  data.settings = data.settings || {};
  data.profile = data.profile || { suggestions: [], approvedObservations: [] };
  data.knowledge = Array.isArray(data.knowledge) ? data.knowledge : [];
  data.learning = Array.isArray(data.learning) ? data.learning : [];
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

async function readOnly(reader) {
  const store = await loadStore();
  const data = withDefaults(store.data || {});
  return reader(data);
}

module.exports = async (req, res) => {
  if (!SUPABASE_URL || !SECRET) {
    res.status(200).json({ error: "Pamięć nieskonfigurowana (brak SUPABASE_URL / SUPABASE_SECRET_KEY)." });
    return;
  }

  if (req.method === "GET") {
    const { folders, chats, activeChatId } = await readOnly((data) => ({
      folders: Object.entries(data.folders).map(([id, f]) => ({ id, name: f.name })),
      chats: Object.entries(data.chats).map(([id, c]) => ({
        id, title: c.title, folderId: c.folder_id || null, updated: c.updated,
      })),
      activeChatId: data.activeChatId,
    }));
    res.status(200).json({ folders, chats, activeChatId });
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
      // ---------- Rozmowy i foldery ----------
      case "getChat": {
        const chat = await readOnly((data) => data.chats[p.chatId]);
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
          if (data.activeChatId === p.chatId) data.activeChatId = Object.keys(data.chats)[0] || null;
          return data.activeChatId;
        });
        res.status(200).json({ ok: true, activeChatId });
        return;
      }
      case "renameChat":
        await mutate((data) => { if (data.chats[p.chatId]) data.chats[p.chatId].title = p.title; });
        res.status(200).json({ ok: true }); return;
      case "moveChat":
        await mutate((data) => { if (data.chats[p.chatId]) data.chats[p.chatId].folder_id = p.folderId || null; });
        res.status(200).json({ ok: true }); return;
      case "createFolder": {
        const id = newId();
        await mutate((data) => { data.folders[id] = { name: p.name }; });
        res.status(200).json({ id });
        return;
      }
      case "deleteFolder":
        await mutate((data) => {
          delete data.folders[p.folderId];
          Object.values(data.chats).forEach((c) => { if (c.folder_id === p.folderId) c.folder_id = null; });
        });
        res.status(200).json({ ok: true }); return;
      case "renameFolder":
        await mutate((data) => { if (data.folders[p.folderId]) data.folders[p.folderId].name = p.name; });
        res.status(200).json({ ok: true }); return;
      case "setActive":
        await mutate((data) => { data.activeChatId = p.chatId; });
        res.status(200).json({ ok: true }); return;
      case "saveChatHistory": {
        const title = await mutate((data) => {
          const chat = data.chats[p.chatId];
          if (!chat) return null;
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
        });
        res.status(200).json({ ok: true, title });
        return;
      }
      case "getGreetingStatus": {
        const lastGreetingDate = await readOnly((data) => data.lastGreetingDate);
        res.status(200).json({ lastGreetingDate });
        return;
      }
      case "setGreetingDate":
        await mutate((data) => { data.lastGreetingDate = p.date; });
        res.status(200).json({ ok: true }); return;

      // ---------- Skarbiec (vault) ----------
      case "vaultList": {
        const files = await readOnly((data) => Object.keys(data.vault));
        res.status(200).json({ files }); return;
      }
      case "vaultRead": {
        const content = await readOnly((data) => data.vault[p.filename] ?? null);
        res.status(200).json({ content }); return;
      }
      case "vaultWrite":
        await mutate((data) => { data.vault[p.filename] = p.content; });
        res.status(200).json({ ok: true }); return;
      case "vaultDelete":
        await mutate((data) => { delete data.vault[p.filename]; });
        res.status(200).json({ ok: true }); return;

      // ---------- Stare, proste "trwałe lekcje" (memory) — zachowane dla wstecznej zgodności ----------
      case "memoryList": {
        const files = await readOnly((data) => Object.keys(data.memory));
        res.status(200).json({ files }); return;
      }
      case "memoryRead": {
        const content = await readOnly((data) => data.memory[p.filename] ?? null);
        res.status(200).json({ content }); return;
      }
      case "memoryWrite":
        await mutate((data) => { data.memory[p.filename] = p.content; });
        res.status(200).json({ ok: true }); return;
      case "memoryDelete":
        await mutate((data) => { delete data.memory[p.filename]; });
        res.status(200).json({ ok: true }); return;

      // ---------- Stan dnia ----------
      case "dailyStateGet": {
        const state = await readOnly((data) => data.dailyState);
        res.status(200).json({ state }); return;
      }
      case "dailyStateSave": {
        const state = await mutate((data) => {
          data.dailyState = { ...data.dailyState, ...(p.state || {}) };
          return data.dailyState;
        });
        res.status(200).json({ ok: true, state }); return;
      }

      // ---------- CRM ----------
      case "crmList": {
        const clients = await readOnly((data) => {
          let list = data.crm;
          const f = p.filters || {};
          if (f.status) list = list.filter((c) => c.status === f.status);
          if (f.stage) list = list.filter((c) => c.stage === f.stage);
          if (f.waiting) {
            const today = new Date().toISOString().slice(0, 10);
            list = list.filter((c) => c.nextFollowUp && c.nextFollowUp <= today);
          }
          return list;
        });
        res.status(200).json({ clients }); return;
      }
      case "crmUpsert": {
        const client = await mutate((data) => {
          const incoming = p.client || {};
          const id = incoming.id || newId("crm");
          const idx = data.crm.findIndex((c) => c.id === id);
          const merged = { ...(idx >= 0 ? data.crm[idx] : {}), ...incoming, id };
          if (idx >= 0) data.crm[idx] = merged; else data.crm.push(merged);
          return merged;
        });
        res.status(200).json({ ok: true, client }); return;
      }
      case "crmDelete":
        await mutate((data) => { data.crm = data.crm.filter((c) => c.id !== p.id); });
        res.status(200).json({ ok: true }); return;

      // ---------- Porzucone sprawy ----------
      case "stalledMattersSave": {
        const items = await mutate((data) => { data.stalledMatters = p.items || []; return data.stalledMatters; });
        res.status(200).json({ ok: true, items }); return;
      }

      // ---------- Model zachowań ----------
      case "behaviorModelGet": {
        const model = await readOnly((data) => data.behaviorModel);
        res.status(200).json({ model }); return;
      }
      case "behaviorModelSave": {
        const model = await mutate((data) => { data.behaviorModel = p.model || data.behaviorModel; return data.behaviorModel; });
        res.status(200).json({ ok: true, model }); return;
      }

      // ---------- Ustawienia ----------
      case "settingsSave": {
        const settings = await mutate((data) => { data.settings = { ...data.settings, ...(p.settings || {}) }; return data.settings; });
        res.status(200).json({ ok: true, settings }); return;
      }

      // ---------- Profil ----------
      case "profileGet": {
        const profile = await readOnly((data) => data.profile);
        res.status(200).json({ profile }); return;
      }
      case "profileSave": {
        const profile = await mutate((data) => { data.profile = p.profile || data.profile; return data.profile; });
        res.status(200).json({ ok: true, profile }); return;
      }

      // ---------- Trwała wiedza (knowledge) ----------
      case "knowledgeList": {
        const entries = await readOnly((data) => {
          let list = data.knowledge;
          if (p.category) list = list.filter((e) => e.category === String(p.category).toUpperCase());
          if (p.activeOnly) list = list.filter((e) => e.active);
          return list;
        });
        res.status(200).json({ entries }); return;
      }
      case "knowledgeUpsert": {
        const entry = await mutate((data) => {
          const incoming = p.entry || {};
          const id = incoming.id || newId("know");
          const idx = data.knowledge.findIndex((e) => e.id === id);
          const merged = { ...(idx >= 0 ? data.knowledge[idx] : {}), ...incoming, id };
          if (idx >= 0) data.knowledge[idx] = merged; else data.knowledge.push(merged);
          return merged;
        });
        res.status(200).json({ ok: true, entry }); return;
      }
      case "knowledgeDelete":
        await mutate((data) => { data.knowledge = data.knowledge.filter((e) => e.id !== p.id); });
        res.status(200).json({ ok: true }); return;

      // ---------- Nauczone reguły (learning) ----------
      case "learningList": {
        const items = await readOnly((data) => {
          let list = data.learning;
          if (p.status) list = list.filter((x) => x.status === p.status);
          return list;
        });
        res.status(200).json({ items }); return;
      }
      case "learningUpsert": {
        const item = await mutate((data) => {
          const incoming = p.item || {};
          const id = incoming.id || newId("learn");
          const idx = data.learning.findIndex((x) => x.id === id);
          const merged = { ...(idx >= 0 ? data.learning[idx] : {}), ...incoming, id };
          if (idx >= 0) data.learning[idx] = merged; else data.learning.push(merged);
          return merged;
        });
        res.status(200).json({ ok: true, item }); return;
      }
      case "learningDelete":
        await mutate((data) => { data.learning = data.learning.filter((x) => x.id !== p.id); });
        res.status(200).json({ ok: true }); return;

      default:
        res.status(400).json({ error: `Nieznana akcja: ${action}` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
