// Wspólne API Debrain / Deczboard. Jeden endpoint catch-all utrzymuje te same
// adresy co lokalny serwer, dzięki czemu telefon i decz.pl korzystają z jednej
// pamięci Supabase zamiast z osobnego localStorage.

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORE_ID = 'debrain-cloud-state';
const bazaStore = require('./_supabase-store');
const { runCloudAutomation } = require('./_debrain-automation-core');
const COLLECTIONS = new Set(['todos', 'projects', 'shopping', 'movies', 'notes', 'links', 'journal', 'expenses', 'date-ideas', 'business-decisions']);

const AUTOMATIONS = [
  { id: 'morning-plan', cloudId: 'morning', name: 'Poranny fokus', companion: 'day', schedule: 'Codziennie 07:30' },
  { id: 'evening-tomorrow', cloudId: 'evening', name: 'Przygotowanie jutra', companion: 'day', schedule: 'Codziennie 21:30' },
  { id: 'weekly-business', cloudId: 'weekly', name: 'Tygodniowy przegląd', companion: 'finance', schedule: 'Poniedziałek 08:30' },
  { id: 'memory-cleanup', cloudId: 'memory', name: 'Porządkowanie pamięci', companion: 'research', schedule: 'Niedziela 19:00' },
];

function newId(prefix) { return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`; }
function now() { return new Date().toISOString(); }
function send(res, status, body) { res.status(status).json(body); }

function defaults(data) {
  const state = data && typeof data === 'object' ? data : {};
  state.board = state.board && typeof state.board === 'object' ? state.board : {};
  state.habitState = state.habitState && typeof state.habitState === 'object' ? state.habitState : null;
  state.graph = state.graph && typeof state.graph === 'object' ? state.graph : { nodes: [], edges: [] };
  state.graph.nodes = Array.isArray(state.graph.nodes) ? state.graph.nodes : [];
  state.graph.edges = Array.isArray(state.graph.edges) ? state.graph.edges : [];
  state.automations = state.automations && typeof state.automations === 'object' ? state.automations : {};
  return state;
}

async function load() {
  if (!SUPABASE_URL || !SECRET) throw new Error('Brak konfiguracji Supabase.');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/debrain_store?id=eq.${encodeURIComponent(STORE_ID)}&select=data,version`, {
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
  });
  if (!response.ok) throw new Error(`Supabase GET ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  if (rows.length) return { data: defaults(rows[0].data), version: Number(rows[0].version || 1) };
  const initial = defaults({});
  const insert = await fetch(`${SUPABASE_URL}/rest/v1/debrain_store`, {
    method: 'POST',
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({ id: STORE_ID, data: initial, version: 1 }),
  });
  if (!insert.ok) throw new Error(`Supabase INSERT ${insert.status}: ${await insert.text()}`);
  return { data: initial, version: 1 };
}

async function save(expectedVersion, data) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_debrain_store`, {
    method: 'POST', headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_id: STORE_ID, p_expected_version: expectedVersion, p_data: data }),
  });
  if (!response.ok) throw new Error(`Supabase SAVE ${response.status}: ${await response.text()}`);
  const result = await response.json();
  return Boolean((Array.isArray(result) ? result[0] : result)?.ok);
}

async function read(getter) { const { data } = await load(); return getter(data); }
async function mutate(mutator) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, version } = await load();
    const result = await mutator(data);
    if (await save(version, data)) return result;
  }
  throw new Error('Konflikt zapisu — spróbuj ponownie.');
}

function automationItems(settings = {}) {
  return AUTOMATIONS.map((item) => ({ ...item, enabled: settings[item.id]?.enabled !== false, running: false, lastRun: settings[item.id]?.lastRun || null, lastResult: settings[item.id]?.lastResult || null, attention: Boolean(settings[item.id]?.attention) }));
}

function graphImport(graph, items) {
  let imported = 0;
  for (const source of items.slice(0, 500)) {
    if (!source?.id || !source?.type || !source?.title) continue;
    const timestamp = now();
    const item = { id: String(source.id), type: String(source.type), title: String(source.title).slice(0, 180), content: String(source.content || ''), source: String(source.source || 'deczboard-import'), domain: source.domain === 'company' ? 'company' : 'private' };
    const old = graph.nodes.find((node) => node.id === item.id);
    if (old) Object.assign(old, item, { updatedAt: timestamp });
    else graph.nodes.push({ ...item, createdAt: timestamp, updatedAt: timestamp });
    imported += 1;
  }
  return imported;
}

function mergeGraph(graph, incoming) {
  const nodes = Array.isArray(incoming?.nodes) ? incoming.nodes.slice(0, 5000) : [];
  const edges = Array.isArray(incoming?.edges) ? incoming.edges.slice(0, 12000) : [];
  for (const node of nodes) {
    if (!node?.id || !node?.title) continue;
    const old = graph.nodes.find((item) => item.id === node.id);
    if (old) Object.assign(old, node, { updatedAt: now() });
    else graph.nodes.push({ ...node, createdAt: node.createdAt || now(), updatedAt: node.updatedAt || now() });
  }
  for (const edge of edges) {
    if (!edge?.id || !edge?.nodeFrom || !edge?.nodeTo) continue;
    if (!graph.nodes.some((node) => node.id === edge.nodeFrom) || !graph.nodes.some((node) => node.id === edge.nodeTo)) continue;
    const old = graph.edges.find((item) => item.id === edge.id || (item.nodeFrom === edge.nodeFrom && item.nodeTo === edge.nodeTo && item.relation === edge.relation));
    if (old) Object.assign(old, edge, { updatedAt: now() });
    else graph.edges.push({ ...edge, createdAt: edge.createdAt || now(), updatedAt: edge.updatedAt || now() });
  }
  return { nodes: graph.nodes.length, edges: graph.edges.length };
}

module.exports = async (req, res) => {
  const raw = req.query.route;
  const route = (Array.isArray(raw) ? raw : String(raw || '').split('/')).filter(Boolean).map(decodeURIComponent);
  const method = req.method || 'GET';
  try {
    // Widok statusu używany przez interfejs na decz.pl.
    if (route[0] === 'debrain' && route[1] === 'status' && method === 'GET') {
      send(res, 200, { online: true, cloud: true, checkedAt: now() }); return;
    }

    if (route[0] === 'habit-state') {
      if (method === 'GET') { send(res, 200, await read((data) => data.habitState || { date: new Date().toISOString().slice(0, 10), done: {} })); return; }
      if (method === 'POST') { const state = await mutate((data) => { data.habitState = { date: String(req.body?.date || new Date().toISOString().slice(0, 10)), done: req.body?.done && typeof req.body.done === 'object' ? req.body.done : {} }; return data.habitState; }); send(res, 200, state); return; }
    }

    if (route[0] === 'board' && COLLECTIONS.has(route[1])) {
      const collection = route[1];
      if (method === 'GET') { send(res, 200, await read((data) => Array.isArray(data.board[collection]) ? data.board[collection] : [])); return; }
      if (method === 'POST' && route[2] === 'items') { const item = await mutate((data) => { const list = Array.isArray(data.board[collection]) ? data.board[collection] : []; const saved = { id: newId(collection), ...(req.body || {}) }; list.push(saved); data.board[collection] = list; return saved; }); send(res, 200, item); return; }
      if (method === 'POST') { const list = await mutate((data) => { data.board[collection] = Array.isArray(req.body) ? req.body : []; return data.board[collection]; }); send(res, 200, list); return; }
    }

    if (route[0] === 'graph') {
      if (route.length === 1 && method === 'GET') { send(res, 200, await read((data) => data.graph)); return; }
      if (route[1] === 'import' && method === 'POST') { const result = await mutate((data) => { const totals = req.body?.graph ? mergeGraph(data.graph, req.body.graph) : { nodes: data.graph.nodes.length, edges: data.graph.edges.length }; return { ok: true, imported: graphImport(data.graph, Array.isArray(req.body?.items) ? req.body.items : []), totalNodes: totals.nodes || data.graph.nodes.length, totalEdges: totals.edges || data.graph.edges.length }; }); send(res, 200, result); return; }
      if (route[1] === 'analyze' && method === 'POST') { send(res, 202, { ok: true, queued: false, reason: 'Analiza AI działa przez rozmowę Debraina; dane zostały już zapisane w Grafie Wiedzy.' }); return; }
      if (route[1] === 'nodes' && route[2]) {
        const nodeId = route[2];
        if (method === 'PATCH') { const node = await mutate((data) => { const found = data.graph.nodes.find((item) => item.id === nodeId); if (!found) return null; if (typeof req.body?.title === 'string' && req.body.title.trim()) found.title = req.body.title.trim(); if (typeof req.body?.content === 'string') found.content = req.body.content; if (req.body?.domain === 'private' || req.body?.domain === 'company') found.domain = req.body.domain; found.updatedAt = now(); return found; }); if (!node) { send(res, 404, { error: 'Nie znaleziono węzła.' }); return; } send(res, 200, { ok: true, node }); return; }
        if (method === 'DELETE') { const removed = await mutate((data) => { const found = data.graph.nodes.find((item) => item.id === nodeId); if (!found) return false; data.graph.nodes = data.graph.nodes.filter((item) => item.id !== nodeId); data.graph.edges = data.graph.edges.filter((edge) => edge.nodeFrom !== nodeId && edge.nodeTo !== nodeId); return true; }); send(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Nie znaleziono węzła.' }); return; }
      }
      if (route[1] === 'edges' && route[2]) {
        const edgeId = route[2];
        if ((method === 'PATCH' && route[3] === 'approve') || method === 'DELETE') { const edge = await mutate((data) => { const found = data.graph.edges.find((item) => item.id === edgeId); if (!found) return null; if (method === 'DELETE') { data.graph.edges = data.graph.edges.filter((item) => item.id !== edgeId); return found; } found.status = 'confirmed'; found.approved = true; found.confidence = Math.max(Number(found.confidence || 0), 0.95); found.updatedAt = now(); return found; }); send(res, edge ? 200 : 404, edge ? { ok: true, edge } : { error: 'Nie znaleziono krawędzi.' }); return; }
      }
    }

    if (route[0] === 'automations') {
      if (route.length === 1 && method === 'GET') { send(res, 200, await read((data) => ({ items: automationItems(data.automations) }))); return; }
      if (route[1] === 'cloud-status' && method === 'GET') { send(res, 200, { connected: true, online: true, provider: 'Supabase + Vercel Cron', active: ['Poranny fokus', 'Przygotowanie jutra', 'Tygodniowy przegląd'] }); return; }
      const definition = AUTOMATIONS.find((item) => item.id === route[1]);
      if (definition && route[2] === 'enabled' && method === 'POST') {
        const enabled = Boolean(req.body?.enabled);
        const item = await mutate((data) => { data.automations[definition.id] = { ...(data.automations[definition.id] || {}), enabled }; return automationItems(data.automations).find((entry) => entry.id === definition.id); });
        // Cron czyta ten sam przełącznik, więc komputer nie musi być włączony.
        await bazaStore.mutateRecord((data) => { data.debrainAutomationSettings = { ...(data.debrainAutomationSettings || {}), [definition.cloudId]: enabled }; });
        send(res, 200, { ok: true, item }); return;
      }
      if (definition && route[2] === 'run' && method === 'POST') {
        let result;
        try { result = await runCloudAutomation(req.headers.host || 'decz.pl', definition.cloudId); }
        catch (error) { send(res, 502, { ok: false, error: error.message }); return; }
        const item = await mutate((data) => { data.automations[definition.id] = { ...(data.automations[definition.id] || {}), lastRun: result.completedAt || now(), lastResult: 'Wykonano w chmurze.', attention: false }; return automationItems(data.automations).find((entry) => entry.id === definition.id); });
        send(res, 200, { ok: true, item, result }); return;
      }
    }

    send(res, 404, { error: `Nieznana trasa API: /api/${route.join('/')}` });
  } catch (error) {
    send(res, 500, { error: error.message || 'Błąd wspólnej pamięci.' });
  }
};
