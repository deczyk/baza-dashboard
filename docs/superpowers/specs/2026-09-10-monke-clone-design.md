# Monke Clone — Design

Data: 2026-09-10
Status: zatwierdzony (Faza 1), Faza 2 w backlogu

## Kontekst

Użytkownik chce odwzorować mechanikę iOS-owej appki **Monke — Habit Game**
(gamifikowany habit tracker: habity+cele, focus timer, waluta "banany",
wyspa z postacią do personalizacji, kolekcjonowalne postacie, sklep,
streaki, statystyki) jako web app / PWA-skrót pod **decz.pl**, w repo
`baza-dashboard`.

Ograniczenie prawne/praktyczne: nie mamy dostępu do rzeczywistej grafiki
ani kodu Monke. Odwzorowujemy **mechanikę i rytm interakcji** (te same
momenty, animacje o tym samym charakterze), z **własnym stylem
wizualnym** — nie kopiujemy assetów.

### Istniejący stan repo (przed tą zmianą)

- `index.html` + `assets/*.js` — skompilowana SPA "Debrain OS" (React),
  **bez kodu źródłowego w repo** — tylko gotowe buildy. Nieedytowalna.
  **Usuwana w ramach tej zmiany** (`git rm`), razem z całym folderem
  `assets/` (384 pliki).
- `baza.html` — pojedynczy statyczny plik HTML/CSS/JS (bez buildu) z
  istniejącym systemem habitów: grupy (Rano/W ciągu dnia/Wieczorem),
  XP, poziomy, rangi, streak. Wzorzec do naśladowania pod względem stylu
  kodu, ale **Monke nie przejmuje tych danych** — działa jako osobna,
  nowa appka (patrz decyzja niżej).
- `habits.json` — statyczna lista habitów używana przez `baza.html`.
  Nie jest reużywana przez Monke (Monke ma własne habity w swoim stanie).
- `api/[...route].js` — jeden catch-all endpoint API dla wszystkich
  modułów (`habit-state`, `werboard-state`, `tataboard-state`, `board/*`,
  `graph/*`, `automations/*`), zapisujący do wspólnego blobu w Supabase
  (tabela `debrain_store`, funkcja RPC `save_debrain_store` z
  optimistic-locking po wersji).
- `api/_supabase-store.js` — wspólny moduł dostępu do Supabase
  (`getLatest`, `mutateRecord`, `putRecord`), używany też przez
  `api/baza-data.js` i inne.
- Wzorzec "osobna appka jako skrót PWA": `werboard.webmanifest` +
  `werboard-icon.svg` — Werboard i TataBoard używają tego wzorca, żeby
  dało się je zainstalować jako osobne ikony na telefonie.
- Repo **nie ma żadnego frameworka testowego** ani kroku budowania
  (poza `web-push`/`resend` jako zależnościami API) — wszystko to
  statyczne pliki serwowane bezpośrednio przez Vercel.

## Decyzje architektoniczne

1. **Monke to nowa, osobna appka**, nie przejmuje istniejącej zakładki
   "Nawyki" w `baza.html`. Działają obok siebie.
2. **Debrain OS zostaje usunięty w całości** (`index.html` +
   `assets/*.js/css`, 384 pliki) — był nieedytowalny (brak źródeł w
   repo), a `index.html` i tak musi zostać przebudowany pod nowy
   launcher.
3. **`index.html` wraca do roli prostego launchera** z trzema kafelkami:
   **Baza / Debrain / Monke**, bez PIN-a (zgodnie z wcześniejszą decyzją
   usunięcia PIN gate'u, commit `d8fae2b`). Baza i Debrain zostają pod
   swoimi dotychczasowymi ścieżkami (`/baza.html`, `/debrain.html`).
4. **Kod Monke: zwykły JS bez buildu, w wielu plikach** — `monke.html`
   jako entry + moduły ładowane jako natywne ES modules
   (`<script type="module">`), bez bundlera. Wybrane świadomie jako
   środek między "jeden gigantyczny plik jak baza.html" a "SPA z
   buildem jak Debrain OS" — ten drugi wzorzec doprowadził do
   nieedytowalnego kodu, więc się go unika.
5. **Backend: nowa trasa `monke-state`** w istniejącym
   `api/[...route].js`, zapisująca do tego samego Supabase blobu co
   reszta modułów, tym samym mechanizmem co `werboard-state`/
   `tataboard-state` (GET zwraca cały stan, POST zapisuje z polem
   `_updatedAt` do rozstrzygania konfliktów między urządzeniami).
6. **Wizualia i animacje: czysty CSS/JS, bez zewnętrznych bibliotek**
   animacyjnych — spójnie z istniejącym wzorcem w `baza.html`
   (`.level-up`/`levelFlash`, `.just-checked`/`checkPop`).

## Zakres Fazy 1 (rdzeń — ta iteracja)

### Funkcje

- **Habity**: nazwa, grupa (edytowalne grupy, domyślnie
  Rano/W ciągu dnia/Wieczorem), opcjonalna godzina, opcjonalny
  `minimumVariant` (prostszy wariant na "zły dzień"), opcjonalne
  powiązanie z celem (`goalId`).
- **Cele**: nazwa + lista powiązanych habitów (`habitIds`). Progres
  celu = ukończone / wszystkie powiązane habity w bieżącym oknie
  (dzień). Wizualnie: pasek postępu (bez animacji żaglówki — to Faza 2).
- **Focus timer**: sesje z odmierzanym czasem, 1 XP za każdą minutę
  skupienia, ekran pełnoekranowy z countdownem.
- **XP / poziom / rangi / streak**: reużyta logika z `baza.html`
  (`levelFromXp`: poziom = `floor(xp/100)+1`; rangi wg progów poziomu;
  streak liczony po kolejnych pełnych dniach) — przeniesiona i
  dostosowana do modelu danych Monke, nie kopiowana 1:1 ze starego
  pliku.
- **Waluta "banany"**: +1 banan za każdy ukończony habit (pełny
  wariant), +1 banan za każde 5 minut ukończonej sesji focus (stała do
  łatwej zmiany w kodzie).
- **Wyspa**: postać monke + ognisko, odblokowywane etapy (`island.stage`,
  0..N) i pojedyncze dekoracje (`island.unlocked: []`) za zgromadzone
  banany. Bez swobodnego rozmieszczania przedmiotów i bez pełnego
  katalogu sklepu — to Faza 2.
- **Statystyki**: poziom, XP, streak, liczba habitów dziś, średni czas
  sesji focus.
- **Onboarding / pierwsze uruchomienie**: jednorazowy (flaga
  `onboarded` w stanie, dostępny ponownie z poziomu ustawień) ekran
  powitalny w krokach: (1) powitanie i poznanie monke, (2) tworzenie
  pierwszego habitu z podpowiedziami z `habits.json`, (3) grupy i tryb
  minimum, (4) focus i XP, (5) banany i wyspa, (6) cele, (7) CTA
  "Zaczynamy!" → ekran Dziś z podświetleniem pierwszego habitu i
  przycisku Focus.

### Animacje (wszystkie CSS/JS, bez bibliotek)

- Wyspa: idle-bounce postaci, migoczące ognisko, delikatny efekt
  otoczenia.
- Odhaczenie habitu: pop-animacja checkboxa + animacja bananu
  wylatującego do licznika z tick-up liczby.
- Focus: postać "idzie" i siada przy ognisku (slide+bob, bez
  sprite'ów), countdown z poświatą ogniska, na koniec — burst XP i
  animacja świętowania.
- Level-up: flash/scale (rozszerzenie `.level-up` z `baza.html`) +
  poświata rangi.
- Streak: pulsujący płomień przy rosnącym streaku.
- Odblokowanie etapu wyspy: fade-in/scale nowej dekoracji.

### Ekrany

- **Dziś** — lista habitów wg grup + pasek postępu dnia.
- **Wyspa** — postać + dekoracje + licznik bananów.
- **Focus** — timer pełnoekranowy.
- **Cele** — lista celów + progres.
- **Statystyki** — poziom/XP/streak/śr. focus.
- **Onboarding** — flow opisany wyżej, pokazywany zamiast ekranu Dziś
  przy pierwszym uruchomieniu.

### Model danych (`monkeState`, jeden obiekt w Supabase, wzorem
`habitState`/`tataboardState`)

```js
{
  onboarded: false,
  habits: [
    { id, name, group, time, minimumVariant, goalId, createdAt }
  ],
  goals: [
    { id, name, habitIds: [...], createdAt }
  ],
  doneLog: { "2026-09-10": { "h1": "full" | "minimum" } },
  focusSessions: [
    { id, startedAt, minutes, xpEarned }
  ],
  currency: { bananas: 0 },
  xp: 0,
  streak: { count: 0, lastCompleteDate: "" },
  island: { stage: 0, unlocked: ["campfire"] }
}
```

### API

W `api/[...route].js`, nowy blok obsługujący `route[0] === 'monke-state'`:

- `GET /api/monke-state` → zwraca cały stan (domyślny obiekt jeśli
  brak, analogicznie do `habitState`).
- `POST /api/monke-state` → zapisuje przesłany stan (z polem
  `_updatedAt` do odrzucania starszych zapisów — wzorem
  `werboard-state`).

Zapis: optymistyczny z retry na konflikcie wersji (mechanizm już
istniejący w `_supabase-store.js`/`mutate` — reużyty, nie pisany od
nowa). Offline: appka działa na ostatnio wczytanym stanie w pamięci;
błąd zapisu → komunikat + możliwość ponowienia, bez utraty lokalnych
zmian w UI.

### Pliki

- `monke.html` — entry point.
- `monke-state.js` — komunikacja z API + lokalny cache stanu.
- `monke-habits.js` — logika habitów, grup, trybu minimum.
- `monke-goals.js` — logika celów i progresu.
- `monke-focus.js` — logika i UI sesji focus.
- `monke-island.js` — logika i renderowanie wyspy/postaci/dekoracji.
- `monke-onboarding.js` — flow pierwszego uruchomienia.
- `monke-ui.js` — wspólne helpery UI/animacji (poziom, XP, streak,
  statystyki).
- `monke.webmanifest` + nowa ikona — instalacja jako osobny skrót PWA
  (wzorzec `werboard.webmanifest`).
- `index.html` (nowy, prosty) — launcher z kafelkami Baza/Debrain/Monke.

### Testowanie

Brak frameworka testowego w repo (spójnie z resztą projektu) — ręczne
QA w przeglądarce: przejście onboardingu, odhaczanie habitów (pełny i
minimum), sesja focus do końca, naliczanie XP/poziomu/streaku/bananów,
odblokowanie etapu wyspy, zapis/odczyt stanu z Supabase (w tym
scenariusz konfliktu dwóch urządzeń).

## Faza 2 (backlog — po ukończeniu rdzenia)

- Pełny sklep z katalogiem dekoracji.
- Swobodne rozmieszczanie przedmiotów na wyspie.
- Kolekcjonowalne postacie-towarzysze o różnej rzadkości.
- Animacja "żaglówka płynie dalej" przy postępie celu.
- Zamiennik iOS Live Activity — np. trwałe powiadomienie push albo
  licznik w tytule karty/favicon podczas sesji focus (natywny Live
  Activity nie istnieje w web).

## Poza zakresem

- Literalne kopiowanie grafik/kodu Monke (niedostępne, niedozwolone).
- Migracja istniejącej zakładki "Nawyki" w `baza.html` do nowego
  modelu — pozostaje bez zmian.
- Zmiana zawartości ani struktury `debrain.html`/`baza.html` poza
  ewentualną korektą linku powrotnego w `debrain.html` (obecnie wskazuje
  na usunięty `index.html` z etykietą "Baza" — do poprawy przy
  implementacji launchera).
