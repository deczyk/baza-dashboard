const store = require("./_supabase-store");

const AUTOMATIONS = {
  coo: {
    name: "Poranny COO",
    prompt: "Jesteś Debrain COO. Zrealizuj pełną pętlę operacyjną: 1) sprawdź kalendarz, zadania, CRM, priorytet i otwarte zobowiązania, 2) wybierz tylko rzeczy o realnym wpływie, 3) ułóż jeden plan: najważniejszy cel, maksymalnie trzy kroki, terminy i ryzyka, 4) zapisz wynik w Bazie. Działaj samodzielnie tylko w odczycie i bezpiecznym zapisie. Maili, publikacji, usuwania i kontaktu z klientem nie wykonuj — przygotuj je do zatwierdzenia. Limit: 3 kroki, jeden raport, bez powtarzania dawnych rekomendacji. Jeśli czegoś brakuje, napisz dokładnie jakiej jednej decyzji potrzebujesz.",
  },
  morning: {
    name: "Poranny fokus",
    prompt: "To automatyczny poranny fokus. Sprawdź kalendarz, zadania, priorytety, CRM, klientów bez kontaktu i obiecane działania. Nie twórz kilku raportów. Wybierz jeden priorytet dnia, maksymalnie trzy kroki i sprawy z twardym terminem. Zapisz jeden zwięzły plan w Bazie.",
  },
  evening: {
    name: "Przygotowanie jutra",
    prompt: "To automatyczne przygotowanie jutra. Przejrzyj rezultat dzisiejszego priorytetu, niedokończone zadania i kalendarz na jutro. Zapisz maksymalnie trzy konkretne punkty na jutro.",
  },
  weekly: {
    name: "Tygodniowy przegląd",
    prompt: "To automatyczny tygodniowy przegląd. Przygotuj jedno wspólne podsumowanie sprzedaży, CRM, wydatków, nieukończonych projektów i ryzyk. Wskaż trzy najważniejsze działania. Następnie bezpiecznie uporządkuj trwałe lekcje: scal tylko oczywiste duplikaty, zachowaj źródła i nie usuwaj niepewnych danych. Nie powtarzaj dziennych rekomendacji i zapisz tylko jeden raport.",
  },
  memory: {
    name: "Porządkowanie pamięci",
    prompt: "To automatyczne porządkowanie pamięci. Scal tylko oczywiste duplikaty, oznacz informacje nieaktualne, zachowaj źródła i nie usuwaj niepewnych danych bez potwierdzenia. Zapisz krótkie podsumowanie zmian.",
  },
};

function parseFinal(ndjson) {
  const lines = String(ndjson || "").trim().split("\n").reverse();
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === "final") return event;
    } catch (_) {}
  }
  return null;
}

async function runCloudAutomation(host, id) {
  const automation = AUTOMATIONS[id];
  if (!automation) throw new Error("Unknown automation");
  const response = await fetch(`https://${host || "decz.pl"}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId: "cloud-automations",
      hidden: true,
      model: "deepseek-chat",
      history: [{ role: "user", content: automation.prompt }],
    }),
  });
  const final = parseFinal(await response.text());
  if (!response.ok || !final || final.error) throw new Error(final?.error || `Chat status ${response.status}`);
  const completedAt = new Date().toISOString();
  await store.mutateRecord((data) => {
    data.debrainAutomations = data.debrainAutomations || {};
    data.debrainAutomations[id] = {
      name: automation.name,
      completedAt,
      result: String(final.reply || "").slice(0, 4000),
    };
  });
  return { ok: true, id, name: automation.name, completedAt };
}

module.exports = { runCloudAutomation };
