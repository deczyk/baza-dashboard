const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

module.exports = async (_req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    res.status(500).json({ ok: false, error: "Brak konfiguracji Supabase." });
    return;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/debrain_store?id=eq.main&select=id,version,updated_at`,
      {
        headers: {
          apikey: SUPABASE_SECRET_KEY,
          Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        },
      }
    );
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);

    res.status(200).json({
      ok: true,
      database: "supabase",
      online: true,
      record: JSON.parse(body)[0] || null,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
