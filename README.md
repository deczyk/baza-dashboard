# Debrain — setup

Twój agent AI na DeepSeek V3.2. Dwie części: CLI (pełne możliwości, na PC) i panel webowy (chat z telefonu/przeglądarki, na Vercelu).

## 0. Klucz API

1. Załóż konto: https://platform.deepseek.com
2. Sekcja API Keys → wygeneruj klucz (`sk-...`)
3. Doładuj konto (płatność z góry, grosze za start wystarczą — DeepSeek V3.2 to $0.14 / $0.28 za milion tokenów)

## 1. CLI (folder `cli/`)

```bash
cd cli
pip install -r requirements.txt

# Windows PowerShell:
$env:DEEPSEEK_API_KEY="sk-twoj-klucz"
# Linux/Mac:
export DEEPSEEK_API_KEY="sk-twoj-klucz"

python debrain.py
```

Tryb rozmowy: po prostu pisz. `exit` żeby wyjść.
Tryb jednorazowy: `python debrain.py "sprawdź kurs EUR/PLN i zapisz do pliku kurs.txt"`

Agent ma 6 narzędzi: `web_search`, `run_python`, `run_shell`, `write_file`, `read_file`, `list_files`.
Wszystkie operacje na plikach i kod wykonują się w izolowanym folderze `debrain_workspace/` (tworzy się automatycznie obok skryptu).

**Persystentna pamięć konwersacji** (na razie) trwa tylko w ramach jednej sesji terminala — po zamknięciu znika. Jeśli chcesz żeby Debrain pamiętał między sesjami, powiedz, dorobię zapis historii do pliku JSON.

## 2. Panel webowy — integracja z decz.pl (repo baza-dashboard)

Zamiast osobnego projektu, Debrain wchodzi do Twojego istniejącego repo `deczyk/baza-dashboard`, pod tą samą domeną decz.pl:

1. **Zmień nazwę** obecnego `index.html` w repo na **`baza.html`** (jego wewnętrzny gate sam się pomija dzięki `sessionStorage.baza_unlocked`, więc zadziała bez zmian)
2. **Wrzuć nowe pliki** z folderu `web/` do repo, na tym samym poziomie co reszta:
   - `index.html` (nadpisuje stary — to teraz PIN + ekran wyboru "Baza / Debrain")
   - `debrain.html` (panel czatu)
   - `api/chat.js` (dokładasz do istniejącego folderu `api/`, obok `baza-data.js` itd.)
3. W Vercel → Settings → Environment Variables dodaj:
   - `DEEPSEEK_API_KEY` = twój klucz z platform.deepseek.com
4. Deploy (albo poczekaj na auto-redeploy po pushu na GitHub)

**Flow:** wchodzisz na decz.pl → wpisujesz PIN (ten sam co teraz, `5855` — zmień w `CONFIG.PIN` w nowym `index.html` jeśli chcesz inny) → widzisz dwa kafelki: **Baza** i **Debrain** → wybierasz, gdzie chcesz wejść.

Panel Debrain ma jedno narzędzie na start: `web_search`. Wykonywanie kodu celowo **nie** jest dostępne w wersji webowej (uruchamianie dowolnego kodu na serverless funkcji dostępnej z internetu to zły pomysł bezpieczeństwa) — do tego służy CLI na Twoim PC.

## Co dalej (opcjonalnie, powiedz jeśli chcesz)

- PIN-gate na panelu webowym (masz to już w Bazie — mogę skopiować mechanizm)
- Zapis historii rozmów do jsonbin.io/Vercel KV, żeby Debrain pamiętał między sesjami
- Podpięcie CLI do Twojego istniejącego workspace (np. narzędzie „przeczytaj plik z Baza/panel.html")
- Model `deepseek-reasoner` zamiast `deepseek-chat` do cięższych, wieloetapowych zadań (wolniejszy, droższy, ale mocniejszy w rozumowaniu)
