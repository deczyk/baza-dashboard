// api/debrain-memory.js — wspólna pamięć Debraina (Vercel Serverless Function)
// Ten sam magazyn (jsonbin) czytają i zapisują: wersja webowa (decz.pl) ORAZ
// desktopowa appka lokalna (gui_app.py), jeśli ma włączoną synchronizację (DEBRAIN_SYNC=1).
//
// Env vary w Vercel:
//   DEBRAIN_JSONBIN_BIN_ID — bin w jsonbin.io
//   JSONBIN_API_KEY        — Twój X-Master-Key z jsonbin.io

const BIN_ID = process.env.DEBRAIN_JSONBIN_BIN_ID;
const KEY = process.env.JSONBIN_API_KEY;
const BASE = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function loadStore() {
  const r = await fetch(`${BASE}/latest`, { headers: { "X-Master-Key": KEY } });
  const data = await r.json();
  const store = (data && data.record) || {};
  store.folders = store.folders || {};
  store.chats = store.chats || {};
  store.activeChatId = store.activeChatId || null;
  store.lastGreetingDate = store.lastGreetingDate || null;
  store.vault = store.vault || {};   // { "nazwa-pliku.md": "treść" }
  store.memory = store.memory || {}; // { "nazwa-pliku.md": "treść" } — destylowane lekcje
  store.profile = store.profile || {"version": 1, "updatedAt": null, "basic": {"name": "Jakub", "language": "polski", "company": "Sklep za Stodołą", "role": "właściciel i osoba rozwijająca sprzedaż bezpośrednią dla rolników"}, "communication": {"style": "konkretnie, bez lania wody", "answerOrder": "najpierw rekomendacja, potem uzasadnienie i następny krok", "detailLevel": "średni; krótko przy prostych sprawach, dokładnie przy wdrożeniach", "tone": "spokojny, bez przesadnego entuzjazmu", "codeDelivery": "gotowe pliki ZIP i dokładna instrukcja wdrożenia"}, "workStyle": {"decisionStyle": "jedna rekomendowana opcja zamiast wielu równorzędnych", "pace": "szybkie wdrażanie i testowanie etapami", "organization": "panel jako centrum pracy", "priorities": ["sprzedaż", "follow-upy", "uruchomienie firmy", "CRM", "automatyzacja", "spójność desktop i decz.pl"]}, "likes": ["gotowe rozwiązania", "jasny następny krok", "podsumowanie wykonanych zmian", "automatyzacja", "ciągłość kontekstu"], "dislikes": ["powtarzanie ustaleń", "ogólne porady bez decyzji", "techniczne komunikaty wewnętrzne", "pięć równych opcji", "pytania doprecyzowujące bez potrzeby"], "motivators": ["widoczny postęp", "zamknięte zadania", "sprzedaż i kontakt z klientami", "działający system zamiast samego planu"], "habitsAndPatterns": [], "approvedObservations": [], "suggestions": []};
  return store;
}

async function saveStore(store) {
  await fetch(BASE, {
    method: "PUT",
    headers: { "X-Master-Key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(store),
  });
}

module.exports = async (req, res) => {
  if (!BIN_ID || !KEY) {
    res.status(200).json({ error: "Pamięć nieskonfigurowana (brak DEBRAIN_JSONBIN_BIN_ID / JSONBIN_API_KEY)." });
    return;
  }

  if (req.method === "GET") {
    const store = await loadStore();
    const folders = Object.entries(store.folders).map(([id, f]) => ({ id, name: f.name }));
    const chats = Object.entries(store.chats).map(([id, c]) => ({
      id, title: c.title, folderId: c.folder_id || null, updated: c.updated,
    }));
    res.status(200).json({ folders, chats, activeChatId: store.activeChatId });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { action, payload } = req.body || {};
  const store = await loadStore();
  const p = payload || {};

  switch (action) {
    case "getChat": {
      const chat = store.chats[p.chatId];
      if (!chat) { res.status(404).json({ error: "Nie znaleziono rozmowy." }); return; }
      res.status(200).json({ id: p.chatId, title: chat.title, folderId: chat.folder_id || null, history: chat.history || [] });
      return;
    }

    case "createChat": {
      const id = newId();
      const now = new Date().toISOString();
      store.chats[id] = { title: p.title || "Nowa rozmowa", folder_id: p.folderId || null, history: [], created: now, updated: now };
      store.activeChatId = id;
      await saveStore(store);
      res.status(200).json({ id });
      return;
    }

    case "deleteChat": {
      delete store.chats[p.chatId];
      if (store.activeChatId === p.chatId) {
        const remaining = Object.keys(store.chats);
        store.activeChatId = remaining[0] || null;
      }
      await saveStore(store);
      res.status(200).json({ ok: true, activeChatId: store.activeChatId });
      return;
    }

    case "renameChat": {
      if (store.chats[p.chatId]) store.chats[p.chatId].title = p.title;
      await saveStore(store);
      res.status(200).json({ ok: true });
      return;
    }

    case "moveChat": {
      if (store.chats[p.chatId]) store.chats[p.chatId].folder_id = p.folderId || null;
      await saveStore(store);
      res.status(200).json({ ok: true });
      return;
    }

    case "createFolder": {
      const id = newId();
      store.folders[id] = { name: p.name };
      await saveStore(store);
      res.status(200).json({ id });
      return;
    }

    case "deleteFolder": {
      delete store.folders[p.folderId];
      Object.values(store.chats).forEach((c) => { if (c.folder_id === p.folderId) c.folder_id = null; });
      await saveStore(store);
      res.status(200).json({ ok: true });
      return;
    }

    case "renameFolder": {
      if (store.folders[p.folderId]) store.folders[p.folderId].name = p.name;
      await saveStore(store);
      res.status(200).json({ ok: true });
      return;
    }

    case "setActive": {
      store.activeChatId = p.chatId;
      await saveStore(store);
      res.status(200).json({ ok: true });
      return;
    }

    case "saveChatHistory": {
      const chat = store.chats[p.chatId];
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
      }
      await saveStore(store);
      res.status(200).json({ ok: true, title: chat ? chat.title : null });
      return;
    }

    case "getGreetingStatus": {
      res.status(200).json({ lastGreetingDate: store.lastGreetingDate });
      return;
    }

    case "setGreetingDate": {
      store.lastGreetingDate = p.date;
      await saveStore(store);
      res.status(200).json({ ok: true });
      return;
    }

    // ---------- Skarbiec (vault) ----------
    case "vaultList": {
      res.status(200).json({ files: Object.keys(store.vault) });
      return;
    }
    case "vaultRead": {
      res.status(200).json({ content: store.vault[p.filename] ?? null });
      return;
    }
    case "vaultWrite": {
      store.vault[p.filename] = p.content;
      await saveStore(store);
      res.status(200).json({ ok: true });
      return;
    }
    case "vaultDelete": {
      delete store.vault[p.filename];
      await saveStore(store);
      res.status(200).json({ ok: true });
      return;
    }

    // ---------- Trwałe lekcje (memory) ----------
    case "memoryList": {
      res.status(200).json({ files: Object.keys(store.memory) });
      return;
    }
    case "memoryRead": {
      res.status(200).json({ content: store.memory[p.filename] ?? null });
      return;
    }
    case "memoryWrite": {
      store.memory[p.filename] = p.content;
      await saveStore(store);
      res.status(200).json({ ok: true });
      return;
    }
    case "memoryDelete": {
      delete store.memory[p.filename];
      await saveStore(store);
      res.status(200).json({ ok: true });
      return;
    }


    // ---------- Profil użytkownika i osobowość ----------
    case "profileGet": {
      res.status(200).json({ profile: store.profile }); return;
    }
    case "profileSave": {
      store.profile = { ...store.profile, ...(p.profile || {}), updatedAt: new Date().toISOString() };
      store.profile.suggestions = store.profile.suggestions || [];
      store.profile.approvedObservations = store.profile.approvedObservations || [];
      await saveStore(store); res.status(200).json({ ok: true, profile: store.profile }); return;
    }
    case "profileAddSuggestion": {
      const text = String(p.text || "").trim();
      if (!text) { res.status(400).json({ error: "Pusta sugestia." }); return; }
      store.profile.suggestions = store.profile.suggestions || [];
      const duplicate = store.profile.suggestions.find(x => x.status === "pending" && String(x.text).toLowerCase() === text.toLowerCase());
      if (duplicate) { res.status(200).json({ ok: true, duplicate: true, suggestion: duplicate }); return; }
      const suggestion = { id: "sug_" + newId(), text, category: p.category || "osobowość", evidence: p.evidence || "", confidence: Number(p.confidence || 0.6), status: "pending", createdAt: new Date().toISOString() };
      store.profile.suggestions.push(suggestion); await saveStore(store); res.status(200).json({ ok: true, suggestion }); return;
    }
    case "profileResolveSuggestion": {
      const item = (store.profile.suggestions || []).find(x => x.id === p.suggestionId);
      if (!item) { res.status(404).json({ error: "Nie znaleziono sugestii." }); return; }
      item.status = p.resolution === "approve" ? "approved" : "rejected"; item.resolvedAt = new Date().toISOString();
      if (item.status === "approved") { store.profile.approvedObservations = store.profile.approvedObservations || []; if (!store.profile.approvedObservations.includes(item.text)) store.profile.approvedObservations.push(item.text); }
      await saveStore(store); res.status(200).json({ ok: true, profile: store.profile }); return;
    }

    default:
      res.status(400).json({ error: "Nieznana akcja." });
  }
};
