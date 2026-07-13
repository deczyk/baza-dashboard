const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORE_ID = process.env.DEBRAIN_STORE_ID || "main";
const PIN = process.env.DEBRAIN_PIN || process.env.DEBRAIN_SYNC_TOKEN;

function auth(req) {
  const supplied = req.headers["x-debrain-pin"] || "";
  return Boolean(PIN && supplied && supplied === PIN);
}

function id() {
  return "cx_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function loadStore() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/debrain_store?id=eq.${encodeURIComponent(STORE_ID)}&select=data,version`,
    { headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` } }
  );
  if (!response.ok) throw new Error(`Supabase GET ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  if (!rows.length) throw new Error("Brak rekordu debrain_store/main.");
  return { data: rows[0].data || {}, version: Number(rows[0].version || 1) };
}

async function saveStore(expectedVersion, data) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_debrain_store`, {
    method: "POST",
    headers: {
      apikey: SECRET,
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_id: STORE_ID,
      p_expected_version: expectedVersion,
      p_data: data,
    }),
  });
  if (!response.ok) throw new Error(`Supabase SAVE ${response.status}: ${await response.text()}`);
  const result = await response.json();
  const row = Array.isArray(result) ? result[0] : result;
  if (!row || !row.ok) return false;
  return true;
}

async function mutate(mutator) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const store = await loadStore();
    const data = structuredClone(store.data || {});
    data.codexTasks = Array.isArray(data.codexTasks) ? data.codexTasks : [];
    const result = mutator(data.codexTasks, data);
    if (await saveStore(store.version, data)) return result;
  }
  throw new Error("Konflikt wersji danych po 5 próbach.");
}

module.exports = async (req, res) => {
  try {
    if (!SUPABASE_URL || !SECRET || !PIN) {
      res.status(500).json({ ok: false, error: "Brak konfiguracji Supabase lub DEBRAIN_PIN." });
      return;
    }
    if (!auth(req)) {
      res.status(401).json({ ok: false, error: "Nieprawidłowy PIN." });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const { action, payload = {} } = req.body || {};

    if (action === "health") {
      const store = await loadStore();
      res.status(200).json({
        ok: true,
        tasks: Array.isArray(store.data.codexTasks) ? store.data.codexTasks.length : 0,
        version: store.version,
      });
      return;
    }

    if (action === "list") {
      const store = await loadStore();
      const tasks = Array.isArray(store.data.codexTasks) ? store.data.codexTasks : [];
      res.status(200).json({ ok: true, tasks: tasks.slice().reverse().slice(0, 100) });
      return;
    }

    if (action === "create") {
      const task = await mutate((tasks) => {
        const task = {
          id: id(),
          projectId: payload.projectId,
          projectName: payload.projectName || payload.projectId,
          prompt: String(payload.prompt || "").trim(),
          mode: payload.mode === "plan" ? "plan" : "execute",
          source: "web",
          status: "queued",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (!task.projectId || !task.prompt) throw new Error("Brak projektu lub treści zadania.");
        tasks.push(task);
        return task;
      });
      res.status(200).json({ ok: true, task });
      return;
    }

    if (action === "upsert") {
      const task = payload.task;
      const saved = await mutate((tasks) => {
        const index = tasks.findIndex((item) => item.id === task.id);
        if (index >= 0) tasks[index] = { ...tasks[index], ...task, updatedAt: new Date().toISOString() };
        else tasks.push({ ...task, updatedAt: new Date().toISOString() });
        return task;
      });
      res.status(200).json({ ok: true, task: saved });
      return;
    }

    if (action === "claim") {
      const claimed = await mutate((tasks) => {
        const selected = [];
        for (const task of tasks) {
          if (task.status !== "queued") continue;
          task.status = "claimed";
          task.claimedBy = payload.host || "desktop";
          task.claimedAt = new Date().toISOString();
          task.updatedAt = new Date().toISOString();
          selected.push({ ...task });
          if (selected.length >= 5) break;
        }
        return selected;
      });
      res.status(200).json({ ok: true, tasks: claimed });
      return;
    }

    res.status(400).json({ ok: false, error: "Nieznana akcja." });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error.message || error) });
  }
};
