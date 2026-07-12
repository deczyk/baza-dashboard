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

  if (!Array.isArray(store.learningFeedback)) store.learningFeedback = [];
  if (!store.dailyState || typeof store.dailyState !== 'object') store.dailyState = {};
  if (!Array.isArray(store.crmClients)) store.crmClients = [];
  if (!Array.isArray(store.stalledMatters)) store.stalledMatters = [];
  if (!store.behaviorModel || typeof store.behaviorModel !== 'object') store.behaviorModel = {observations:[],version:1};
  if (!Array.isArray(store.knowledgeEntries)) {
    const now = new Date().toISOString();
    store.knowledgeEntries = [
      { id:"knowledge_premium_price", category:"DECYZJA", text:"Domyślna oferta Premium kosztuje 14 500 EUR netto.", source:"ustalenia biznesowe", confidence:1, active:true, createdAt:now, updatedAt:now },
      { id:"knowledge_offer_order", category:"ZASADA", text:"Najtańszego wariantu nie proponować na początku rozmowy; używać go dopiero przy obiekcji budżetowej.", source:"ustalenia sprzedażowe", confidence:1, active:true, createdAt:now, updatedAt:now },
      { id:"knowledge_sales_start", category:"STATUS", text:"Sprzedaż mlekomatów ma ruszyć po przygotowaniu wersji pod polski system i walutę.", source:"ustalenia projektu", confidence:0.9, active:true, createdAt:now, updatedAt:now },
      { id:"knowledge_zip_preference", category:"PREFERENCJA", text:"Przy zmianach technicznych użytkownik preferuje gotową paczkę ZIP i dokładną instrukcję wdrożenia.", source:"potwierdzone zachowanie użytkownika", confidence:1, active:true, createdAt:now, updatedAt:now }
    ];
  }
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

  const body = req.body || {};
  const action = body.action || req.query?.action || "";
  const payload = body.payload || body.data || {};
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






    case "stalledMattersGet": {
      res.status(200).json({items:Array.isArray(store.stalledMatters)?store.stalledMatters:[]});return;
    }
    case "stalledMattersSave": {
      store.stalledMatters=Array.isArray(p.items)?p.items.slice(0,8):[];
      await saveStore(store);res.status(200).json({ok:true,items:store.stalledMatters});return;
    }
    case "behaviorModelGet": {
      res.status(200).json({model:store.behaviorModel||{observations:[],version:1}});return;
    }
    case "behaviorModelSave": {
      store.behaviorModel={...(store.behaviorModel||{}),...(p.model||{}),updatedAt:new Date().toISOString()};
      await saveStore(store);res.status(200).json({ok:true,model:store.behaviorModel});return;
    }

    case "crmList": {
      let clients=Array.isArray(store.crmClients)?store.crmClients:[];
      const f=p.filters||{};
      if(f.status)clients=clients.filter(x=>x.status===f.status);
      if(f.stage)clients=clients.filter(x=>x.stage===f.stage);
      res.status(200).json({clients});return;
    }
    case "crmUpsert": {
      const raw=p.client||{},now=new Date().toISOString(),id=String(raw.id||("crm_"+newId())),current=(store.crmClients||[]).find(x=>x.id===id);
      const client={id,name:String(raw.name||"").trim(),contactPerson:"",phone:"",email:"",location:"",leadSource:"",product:"",opportunityValue:"",status:"nowy",stage:"lead",lastContact:"",nextFollowUp:"",advisorSent:false,offerSent:false,objections:"",notes:"",history:[],createdAt:current?.createdAt||now,...(current||{}),...raw,updatedAt:now};
      if(!client.name){res.status(400).json({error:"Nazwa klienta jest wymagana."});return;}
      store.crmClients=(store.crmClients||[]).filter(x=>x.id!==id);store.crmClients.push(client);await saveStore(store);res.status(200).json({ok:true,client});return;
    }
    case "crmDelete": {
      const id=String(p.id||"");store.crmClients=(store.crmClients||[]).filter(x=>x.id!==id);await saveStore(store);res.status(200).json({ok:true});return;
    }
    case "crmAddActivity": {
      const id=String(p.id||""),client=(store.crmClients||[]).find(x=>x.id===id);if(!client){res.status(404).json({error:"Nie znaleziono klienta."});return;}
      const a=p.activity||{},text=String(a.text||"").trim();if(!text){res.status(400).json({error:"Treść aktywności jest wymagana."});return;}
      const item={id:"act_"+newId(),type:String(a.type||"aktywność"),text,date:a.date||new Date().toISOString()};client.history=Array.isArray(client.history)?client.history:[];client.history.push(item);client.lastContact=item.date.slice(0,10);client.updatedAt=new Date().toISOString();await saveStore(store);res.status(200).json({ok:true,client});return;
    }

    case "dailyStateGet": {
      res.status(200).json({state:store.dailyState||{}});return;
    }
    case "dailyStateSave": {
      const now=new Date().toISOString();
      store.dailyState={...(store.dailyState||{}),...(p.state||{}),date:new Date().toISOString().slice(0,10),updatedAt:now};
      await saveStore(store);res.status(200).json({ok:true,state:store.dailyState});return;
    }

    case "learningList": {
      let items=Array.isArray(store.learningFeedback)?store.learningFeedback:[];
      if(p.status)items=items.filter(x=>x.status===p.status);
      res.status(200).json({items});return;
    }
    case "learningUpsert": {
      const raw=p.item||{},now=new Date().toISOString(),id=String(raw.id||("learn_"+newId())),current=(store.learningFeedback||[]).find(x=>x.id===id);
      const item={...(current||{}),...raw,id,text:String(raw.text||"").trim(),kind:String(raw.kind||"PREFERENCJA").toUpperCase(),status:String(raw.status||"pending"),confidence:Math.max(0,Math.min(1,Number(raw.confidence??0.75))),createdAt:current?.createdAt||raw.createdAt||now,updatedAt:now};
      if(!item.text){res.status(400).json({error:"Pusta treść reguły."});return;}
      store.learningFeedback=(store.learningFeedback||[]).filter(x=>x.id!==id);store.learningFeedback.push(item);await saveStore(store);res.status(200).json({ok:true,item});return;
    }
    case "learningDelete": {
      const id=String(p.id||"");store.learningFeedback=(store.learningFeedback||[]).filter(x=>x.id!==id);await saveStore(store);res.status(200).json({ok:true});return;
    }

    // ---------- Pamięć decyzji, faktów i ustaleń ----------
    case "knowledgeList": {
      let entries = Array.isArray(store.knowledgeEntries) ? store.knowledgeEntries : [];
      if (p.category) entries = entries.filter(x => x.category === String(p.category).toUpperCase());
      if (p.activeOnly) entries = entries.filter(x => x.active !== false);
      entries.sort((a,b) => String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
      res.status(200).json({ entries }); return;
    }
    case "knowledgeUpsert": {
      const raw = p.entry || {};
      const text = String(raw.text || "").trim();
      if (!text) { res.status(400).json({ error: "Pusta treść wpisu." }); return; }
      const allowed = ["DECYZJA","FAKT","STATUS","ZASADA","PREFERENCJA","CEL","RYZYKO","DO POTWIERDZENIA"];
      const category = allowed.includes(String(raw.category||"").toUpperCase()) ? String(raw.category).toUpperCase() : "DO POTWIERDZENIA";
      const now = new Date().toISOString();
      const id = String(raw.id || ("know_" + newId()));
      const current = (store.knowledgeEntries || []).find(x => x.id === id);
      const entry = {
        ...(current || {}),
        ...raw,
        id, category, text,
        source: String(raw.source || "ręcznie"),
        confidence: Math.max(0, Math.min(1, Number(raw.confidence ?? 1))),
        active: raw.active !== false,
        createdAt: current?.createdAt || raw.createdAt || now,
        updatedAt: now
      };
      store.knowledgeEntries = (store.knowledgeEntries || []).filter(x => x.id !== id);
      store.knowledgeEntries.push(entry);
      await saveStore(store); res.status(200).json({ ok:true, entry }); return;
    }
    case "knowledgeDelete": {
      const id = String(p.id || "");
      store.knowledgeEntries = (store.knowledgeEntries || []).filter(x => x.id !== id);
      await saveStore(store); res.status(200).json({ ok:true }); return;
    }

    default:
      res.status(400).json({ error: `Nieznana akcja: ${action || "(brak)"}` });
  }
};
