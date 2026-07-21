// api/capitol-trades.js — próbuje pobrać ostatnie transakcje polityków USA z capitoltrades.com.
// UWAGA: to nieoficjalne rozwiązanie (Capitol Trades nie ma publicznego API). Strona może zmienić
// swoją strukturę w każdej chwili i to przestanie działać — stąd wbudowany bezpiecznik: jeśli parser
// nie znajdzie żadnych transakcji, endpoint jasno mówi o tym (ok:false), a widget w Bazie wtedy sam
// pokazuje zwykły link zamiast pustego/zepsutego miejsca.

module.exports = async (req, res) => {
  try {
    // Publiczny kanał JSON nie wymaga scrapowania HTML i działa także z Vercela.
    const apiResponse = await fetch("https://www.bargo.ai/free-apis/congress/v1/trades?limit=15", {
      headers: { "Accept": "application/json" },
    });

    if (apiResponse.ok) {
      const payload = await apiResponse.json();
      const apiTrades = Array.isArray(payload.trades) ? payload.trades.map(trade => ({
        politician: { name: trade.member || "—" },
        issuer: {
          name: trade.asset || trade.ticker || "—",
          ticker: trade.ticker || "",
        },
        type: trade.type || "",
        transactionDate: trade.transaction_date || "",
        disclosureDate: trade.disclosure_date || "",
        amount: trade.amount_range || "",
      })) : [];

      if (apiTrades.length) {
        res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
        res.status(200).json({
          ok: true,
          trades: apiTrades,
          source: "Bargo Congress Trades",
          fetchedAt: new Date().toISOString(),
        });
        return;
      }
    }

    // Awaryjnie próbujemy dotychczasowego źródła HTML.
    const response = await fetch("https://www.capitoltrades.com/trades", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "text/html",
      },
    });

    if (!response.ok) {
      res.status(200).json({ ok: false, reason: `Strona odpowiedziała statusem ${response.status}` });
      return;
    }

    const html = await response.text();
    let trades = [];

    // Próba 1: wiele nowoczesnych stron (Next.js) osadza pełne dane strony jako JSON w tagu <script>,
    // używany do "hydration" po stronie klienta — jeśli to znajdziemy, dane są kompletne i pewne.
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        const json = JSON.parse(nextDataMatch[1]);
        const found = findTradesInObject(json);
        if (found.length) trades = found;
      } catch (e) {
        // ignorujemy, spróbujemy planu B niżej
      }
    }

    // Próba 2: surowe parsowanie tabeli HTML (fallback, mniej pewne, ale czasem jedyne co jest).
    if (!trades.length) {
      trades = parseTradesFromHtmlTable(html);
    }

    if (!trades.length) {
      res.status(200).json({ ok: false, reason: "Nie znaleziono danych w odpowiedzi strony — prawdopodobnie strona wymaga wykonania JavaScript, którego to proste pobranie nie robi." });
      return;
    }

    res.status(200).json({ ok: true, trades: trades.slice(0, 15), fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(200).json({ ok: false, reason: err.message });
  }
};

function findTradesInObject(obj, depth = 0) {
  if (depth > 6 || !obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) {
    const looksLikeTrades = obj.length > 0 && obj[0] && typeof obj[0] === "object" &&
      ("politician" in obj[0] || "issuer" in obj[0] || "txDate" in obj[0]);
    if (looksLikeTrades) return obj;
    for (const item of obj) {
      const found = findTradesInObject(item, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  for (const key of Object.keys(obj)) {
    const found = findTradesInObject(obj[key], depth + 1);
    if (found.length) return found;
  }
  return [];
}

function parseTradesFromHtmlTable(html) {
  // Bardzo uproszczony, "najlepszy możliwy" parser wierszy tabeli — kruchy z założenia,
  // to jest plan B używany tylko jeśli nie znaleziono ustrukturyzowanego JSON-a.
  const rows = [];
  const rowMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  for (const row of rowMatches.slice(0, 20)) {
    const textOnly = row.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (textOnly.length > 20 && /buy|sell/i.test(textOnly)) {
      rows.push({ raw: textOnly.slice(0, 200) });
    }
  }
  return rows;
}
