# Debrain — wspólna pamięć, lepsze wyszukiwanie, system lekcji

Trzy duże rzeczy w tej paczce. Możesz wdrażać po kolei albo od razu wszystko.

## 1. Wspólna pamięć web ↔ desktop

**Web (Vercel):** wgraj `web/debrain.html` i `web/api/chat.js`, `web/api/debrain-memory.js` (nadpisują poprzednie). Ma teraz **taki sam boczny panel z folderami** jak wersja desktopowa.

**Desktop:** wgraj wszystkie pliki z `desktop/` (nadpisują poprzednie). Domyślnie nadal działa lokalnie — żeby włączyć współdzielenie z webem, w swoim `.env` odkomentuj:
```
DEBRAIN_SYNC=1
```
Od tego momentu appka desktopowa i decz.pl czytają/piszą do **tego samego magazynu** (ten sam bin w jsonbin.io co już masz skonfigurowany — `DEBRAIN_JSONBIN_BIN_ID`). Rozmowa zaczęta na telefonie będzie widoczna na komputerze i odwrotnie.

**Uwaga:** jeśli miałeś już lokalne rozmowy w `chats.json` przed włączeniem synchronizacji, one zostają lokalnie i nie automatycznie się nie "wleją" do wspólnego magazynu — zaczniesz z czystym kontem po stronie wspólnej pamięci. Jeśli chcesz je przenieść ręcznie, powiedz, pomogę.

## 2. Lepsze wyszukiwanie (Serper.dev zamiast samego DuckDuckGo)

1. Załóż konto na **serper.dev** (darmowy tier: 2500 zapytań, karta niewymagana na start)
2. Skopiuj swój API key
3. **Desktop:** dodaj do `.env`:
   ```
   SERPER_API_KEY=twoj-klucz
   ```
4. **Web:** dodaj w Vercel → Settings → Environment Variables: `SERPER_API_KEY` = twój klucz, zrób redeploy

Bez tego klucza wszystko działa jak wcześniej (DuckDuckGo jako fallback) — to czysto opcjonalne ulepszenie. Z kluczem Debrain będzie szukał realnie jak przeglądarka Google, więc niszowe zapytania (jak te producenci figur krowy) powinny teraz działać.

## 3. System lekcji (Write / Consolidate / Recall / Apply)

Działa **tylko w wersji desktopowej** (potrzebuje dostępu do plików, którego web celowo nie ma). Nic nie musisz instalować — to czysto zmiana w prompt systemowym, już wgrana wraz z `agent_core.py`.

Jak używać:
- **Zapisz lekcję:** *"zapisz to na przyszłość"* pod koniec wartościowej sesji — Debrain sam oceni czy to faktycznie nowa lekcja, zapisze w `debrain_workspace/memory/` z jednolinijkowym podsumowaniem na górze
- **Skonsoliduj (raz w tygodniu):** *"skonsoliduj pamięć"* — przejrzy wszystkie pliki, połączy duplikaty, usunie nieaktualne
- **Przypomnienie dzieje się samo** na starcie zadań, które mogą mieć związek z czymś zapisanym — Debrain jawnie powie co znalazł albo że nic nie pasuje

To nie dzieje się automatycznie przy każdej wiadomości — tylko kiedy o to poprosisz albo kiedy sam oceni że coś jest warte zapisania.

## Podsumowanie zmiennych środowiskowych (nowe w tej paczce)

| Zmienna | Gdzie | Do czego |
|---|---|---|
| `DEBRAIN_SYNC=1` | desktop `.env` | włącza wspólną pamięć z webem |
| `SERPER_API_KEY` | desktop `.env` + Vercel | lepsze wyszukiwanie |
