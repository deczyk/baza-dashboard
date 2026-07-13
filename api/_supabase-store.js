// api/_supabase-store.js — wspólny magazyn Bazy na Supabase (darmowe na zawsze, bez limitu zapytań
// jak w jsonbin.io). Używany przez baza-data.js, calendar-*.js, google-auth-callback.js,
// send-reminders.js, weekly-summary.js — wszystkie dzielą jeden wiersz (id="baza-data") w tej
// samej tabeli `debrain_store`, którą już masz przygotowaną (supabase/01_DEBRAIN_ONLINE.sql).
//
// To NIE jest osobna funkcja API (Vercel nie routuje plików zaczynających się od "_") —
// to zwykły moduł importowany przez inne pliki w tym folderze.
//
// Env vary w Vercel:
//   SUPABASE_URL
//   SUPABASE_SECRET_KEY albo SUPABASE_SERVICE_ROLE_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORE_ID = "baza-data";

function configured() {
  return Boolean(SUPABASE_URL && SECRET);
}

async function loadRecord() {
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
    return { record: {}, version: 1 };
  }
  return { record: rows[0].data || {}, version: Number(rows[0].version || 1) };
}

async function saveRecordRaw(expectedVersion, record) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_debrain_store`, {
    method: "POST",
    headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: STORE_ID, p_expected_version: expectedVersion, p_data: record }),
  });
  if (!response.ok) throw new Error(`Supabase SAVE ${response.status}: ${await response.text()}`);
  const result = await response.json();
  const row = Array.isArray(result) ? result[0] : result;
  return Boolean(row && row.ok);
}

/** Prosty odczyt całego rekordu — zwraca kształt zgodny z tym, co dawał jsonbin ({record: {...}}). */
async function getLatest() {
  const { record } = await loadRecord();
  return { record };
}

/** Prosty zapis całego rekordu, blindly (jak stare PUT do jsonbin) — używaj tylko tam, gdzie
 * oryginalny kod robił dokładnie to samo (żeby nie zmieniać zachowania). Wewnętrznie i tak
 * chroni przed utratą równoległego zapisu (retry na konflikcie wersji). */
async function putRecord(newRecord) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { version } = await loadRecord();
    if (await saveRecordRaw(version, newRecord)) return { record: newRecord };
  }
  throw new Error("Konflikt wersji danych po 5 próbach — spróbuj ponownie.");
}

/** Bezpieczna zmiana fragmentu rekordu — czyta, wywołuje mutator(record), zapisuje z retry.
 * Preferowana metoda tam, gdzie oryginalny kod robił get→zmień pole→put (unika nadpisania
 * cudzych zmian zapisanych w międzyczasie). */
async function mutateRecord(mutator) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { record, version } = await loadRecord();
    const result = mutator(record);
    if (await saveRecordRaw(version, record)) return { record, result };
  }
  throw new Error("Konflikt wersji danych po 5 próbach — spróbuj ponownie.");
}

module.exports = { configured, getLatest, putRecord, mutateRecord };
