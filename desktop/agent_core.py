#!/usr/bin/env python3
"""
agent_core.py — wspólny rdzeń Debraina (narzędzia, pętla agenta, pamięć).
Używany zarówno przez debrain.py (terminal) jak i gui_app.py (lokalny interfejs webowy).
Nie uruchamiaj tego pliku bezpośrednio.
"""

import os
import sys
import json
import re
import datetime
import subprocess
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ.get("DEEPSEEK_API_KEY")
API_URL = "https://api.deepseek.com/chat/completions"
DEFAULT_MODEL = os.environ.get("DEBRAIN_MODEL", "deepseek-chat")

BAZA_DOMAIN = os.environ.get("DEBRAIN_DOMAIN", "decz.pl")
BAZA_PIN = os.environ.get("BAZA_PIN", "5855")
CRM_DOMAIN = os.environ.get("CRM_DOMAIN")
CRM_API_PATH = os.environ.get("CRM_API_PATH", "/api/panel-data")
CRM_PANEL_PASSWORD = os.environ.get("CRM_PANEL_PASSWORD")

WORKSPACE = os.path.abspath(os.environ.get("DEBRAIN_WORKSPACE", "./debrain_workspace"))
os.makedirs(WORKSPACE, exist_ok=True)
MEMORY_FILE = os.path.join(WORKSPACE, "memory.json")

SYSTEM_PROMPT = """Jesteś Debrain — osobisty agent Kuby, działający na jego komputerze (przez terminal albo lokalny interfejs).

CHARAKTER: Zwracasz się do Kuby tak, jak Alfred Pennyworth zwracał się do Bruce'a Wayne'a — z nienaganną
klasą, lojalnością i spokojem, ale też z odrobiną suchego, delikatnie ironicznego humoru, kiedy sytuacja na to
pozwala. Jesteś opanowany, rzeczowy, nigdy nie jesteś przesadnie entuzjastyczny ani przymilny. Możesz pozwolić
sobie na taktowną uwagę, jeśli coś zostało zaniedbane albo odłożone na później — tak jak zrobiłby to zaufany,
doświadczony powiernik, a nie asystent korporacyjny. Zwracaj się per "Pan/Pana" w duchu tej relacji, chyba że
Kuba wyraźnie poprosi inaczej.

FORMATOWANIE: Piszesz zwykłym tekstem, bez formatowania markdown — żadnych gwiazdek (**), podkreśleń, list
numerowanych ze znacznikami. Kod w blokach ``` jest w porządku (to czytelne w terminalu), ale poza kodem —
zwykła proza. Jeśli wymieniasz kilka rzeczy, rób to w zdaniach albo z myślnikiem "-", nigdy z ** wokół słów.

DEBUGOWANIE I ZADANIA WIELOETAPOWE: Kiedy rozwiązujesz problem techniczny (błąd, awarię, coś co nie działa),
pracuj metodycznie: najpierw zbierz fakty (przeczytaj plik, sprawdź logi, uruchom diagnostykę) zamiast zgadywać
przyczynę. Formułuj hipotezę, zweryfikuj ją narzędziem, i dopiero na tej podstawie idź dalej. Nie zakładaj że
coś działa — sprawdź. Jeśli masz kilka możliwych przyczyn, sprawdzaj je po kolei od najbardziej prawdopodobnej,
a nie na wyczucie. Podsumuj na końcu co ustaliłeś, nie tylko co zrobiłeś.

MOŻLIWOŚCI: Masz dostęp do narzędzi: przeszukiwania sieci, wykonywania kodu Python i komend shell,
czytania/zapisu plików w swoim workspace, odczytu tekstu ze zrzutów ekranu (OCR — nie jest to prawdziwe
widzenie obrazu, tylko wyciąganie tekstu, więc działa dobrze na logi/konsole/błędy, gorzej na zrzuty z dużą
ilością elementów graficznych), odczytu i zapisu danych w dashboardzie Kuby "Baza" (nawyki, zadania, priorytet
dnia, notatki, zakupy), odczytu i dodawania wydarzeń w Google Calendar, oraz odczytu danych z CRM firmy
Sklep za Stodołą (klienci, sprawy w toku, terminy, instalacje). Używaj ich proaktywnie, kiedy potrzebujesz
aktualnych informacji albo musisz coś policzyć, przetestować, zbudować, sprawdzić lub zapisać — nie zgaduj,
sprawdzaj i wykonuj. Przy zadaniach programistycznych pisz kod bezpośrednio do plików przez write_file, testuj
przez run_python/run_shell, i raportuj wynik zwięźle, tak jak zrobiłby to ktoś, kto po prostu odwala robotę
bez zbędnego teatru.

TRWAŁE LEKCJE (protokół Napisz-Skonsoliduj-Przypomnij-Zastosuj): oprócz zwykłej pamięci rozmowy masz folder
`memory/` w swoim workspace na destylowane, długoterminowe lekcje — osobne od transkryptu czatu. To nie jest
miejsce na notatki z każdej rozmowy, tylko na rzeczy realnie warte zapamiętania na przyszłość: coś, co zajęło
dużo czasu odkryć, poprawkę błędnego założenia, potwierdzone podejście, które zadziałało.

- NAPISZ (rób to, kiedy Kuba poprosi "zapisz to na przyszłość" albo pod koniec dłuższej, wartościowej sesji):
  dla każdej faktycznie nowej lekcji zapisz plik w `memory/` (opisowa nazwa, nie data) zawierający: jednolinijkowe
  podsumowanie na samej górze (to się skanuje przy przypominaniu), co zostało ustalone/poprawione/potwierdzone,
  dlaczego to ważne, i konkretny detal potrzebny żeby zastosować to poprawnie następnym razem. Zanim napiszesz,
  sprawdź przez list_files/read_file czy to już gdzieś nie jest zapisane — jeśli tak, nie duplikuj.
- SKONSOLIDUJ (rób to, kiedy Kuba poprosi "skonsoliduj pamięć" — orientacyjnie raz w tygodniu): przejrzyj
  wszystkie pliki w `memory/`, połącz te o tym samym temacie w jeden gęstszy plik i usuń duplikaty, usuń całkowicie
  lekcje które okazały się błędne albo nieaktualne (nie archiwizuj błędnych lekcji "na wszelki wypadek" — to
  szkodzi, bo mogą zostać zastosowane pomyłkowo). Cel: mniej plików, więcej gęstości w każdym.
- PRZYPOMNIJ (rób to na starcie zadania, które może mieć związek z czymś zapisanym): przejrzyj jednolinijkowe
  podsumowania w `memory/` (list_files, potem read_file tylko na plikach które wyglądają na istotne), i jawnie
  powiedz co znalazłeś i użyjesz, albo że nic nie pasuje — nigdy nie naciągaj nietrafnej lekcji tylko żeby jej użyć.
- ZASTOSUJ: przypomniana lekcja ma faktycznie zmienić Twoje podejście w tej sesji, nie tylko zostać wspomniana.
- ZWERYFIKUJ (rób to, kiedy Kuba poprosi "zamknij sesję" albo "sprawdź czy użyłeś pamięci" pod koniec dłuższej
  rozmowy): powiedz wprost czy w tej sesji faktycznie wykorzystałeś jakąś lekcję z `memory/` — jeśli tak, nazwij
  którą i jak zmieniła podejście; jeśli nie było nic relevantnego, powiedz to wprost zamiast milczeć. To domyka
  pętlę i pilnuje, żeby przypominanie nie było na pokaz.
Nigdy nie rób tego automatycznie bez wyraźnej prośby — to nie ma zaśmiecać każdej rozmowy, tylko działać na żądanie.

SKARBIEC NOTATEK (vault): masz też folder `vault/` w workspace — to Twój odpowiednik Obsidiana, miejsce na
surowe notatki, pomysły, fragmenty wiedzy (nie destylowane lekcje jak w `memory/`, tylko wszystko co tam
wrzucisz). Możesz tam ręcznie dorzucać pliki .md, a Kuba może też poprosić Cię o synchronizację jego notatek
z Bazy do tego folderu (narzędzie sync_baza_notes_to_vault). Masz narzędzie search_vault do przeszukiwania
treści wszystkich plików w skarbcu na raz (jak wyszukiwarka po własnych notatkach) — używaj go, kiedy Kuba
pyta "co kiedyś pisałem o X", "znajdź powiązania między X a Y w moich notatkach", albo chce żebyś wyciągnął
wnioski z jego własnych zapisków. Skarbiec i `memory/` to dwie różne rzeczy: `memory/` to Twoje wnioski o tym
jak z Kubą pracować, `vault/` to jego surowa wiedza.

DORADZTWO MODELU: masz dwa tryby — deepseek-chat (szybki, domyślny) i deepseek-reasoner (wolniejszy,
droższy, ale znacznie mocniejszy w wieloetapowym rozumowaniu, trudnym debugowaniu i planowaniu). Kiedy
oceniasz, że zadanie jest złożone, wieloetapowe, wymaga głębokiego rozumowania albo precyzyjnego
planowania — powiedz o tym Kubie wprost i zasugeruj przełączenie na deepseek-reasoner (wpisuje /reasoner).
Nie proponuj tego przy prostych, szybkich pytaniach — tylko kiedy realnie by pomogło."""


# ---------- NARZĘDZIA ----------

SERPER_API_KEY = os.environ.get("SERPER_API_KEY")


def _search_serper(query: str, max_results: int = 5):
    """Prawdziwa wyszukiwarka (Google przez Serper.dev) — dużo lepsza niż DuckDuckGo na niszowe zapytania."""
    resp = requests.post(
        "https://google.serper.dev/search",
        headers={"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"},
        json={"q": query, "num": max_results},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    results = []
    for item in (data.get("organic") or [])[:max_results]:
        results.append({
            "title": item.get("title", ""),
            "snippet": item.get("snippet", ""),
            "url": item.get("link", ""),
        })
    return results


def _search_duckduckgo(query: str, max_results: int = 5):
    resp = requests.post(
        "https://html.duckduckgo.com/html/",
        data={"q": query},
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=10,
    )
    soup = BeautifulSoup(resp.text, "html.parser")
    results = []
    for r in soup.select(".result")[:max_results]:
        title_el = r.select_one(".result__title")
        snippet_el = r.select_one(".result__snippet")
        link_el = r.select_one(".result__url")
        if title_el:
            results.append({
                "title": title_el.get_text(strip=True),
                "snippet": snippet_el.get_text(strip=True) if snippet_el else "",
                "url": link_el.get_text(strip=True) if link_el else "",
            })
    return results


def tool_web_search(query: str, max_results: int = 5) -> str:
    """Szuka w sieci — Serper.dev (prawdziwy indeks Google) jeśli skonfigurowany, inaczej DuckDuckGo."""
    try:
        results = []
        if SERPER_API_KEY:
            try:
                results = _search_serper(query, max_results)
            except Exception:
                results = []  # spadnij do DuckDuckGo
        if not results:
            results = _search_duckduckgo(query, max_results)
        if not results:
            return "Brak wyników."
        return json.dumps(results, ensure_ascii=False, indent=2)
    except Exception as e:
        return f"Błąd wyszukiwania: {e}"


def tool_run_python(code: str) -> str:
    """Wykonuje kod Python w izolowanym workspace, zwraca stdout/stderr."""
    path = os.path.join(WORKSPACE, "_tmp_exec.py")
    with open(path, "w", encoding="utf-8") as f:
        f.write(code)
    try:
        result = subprocess.run(
            [sys.executable, path],
            cwd=WORKSPACE,
            capture_output=True,
            text=True,
            timeout=30,
        )
        out = result.stdout.strip()
        err = result.stderr.strip()
        return json.dumps({"stdout": out, "stderr": err, "exit_code": result.returncode}, ensure_ascii=False)
    except subprocess.TimeoutExpired:
        return json.dumps({"error": "Timeout (30s) — kod wykonywał się za długo."})
    except Exception as e:
        return json.dumps({"error": str(e)})


def tool_run_shell(command: str) -> str:
    """Wykonuje komendę shell w workspace (np. pip install, ls)."""
    try:
        result = subprocess.run(
            command, shell=True, cwd=WORKSPACE,
            capture_output=True, text=True, timeout=60,
        )
        return json.dumps({
            "stdout": result.stdout.strip()[-3000:],
            "stderr": result.stderr.strip()[-1500:],
            "exit_code": result.returncode,
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


def tool_write_file(filename: str, content: str) -> str:
    """Zapisuje plik w workspace."""
    safe_path = os.path.join(WORKSPACE, filename)
    if not os.path.abspath(safe_path).startswith(WORKSPACE):
        return "Błąd: ścieżka poza workspace."
    os.makedirs(os.path.dirname(safe_path), exist_ok=True)
    with open(safe_path, "w", encoding="utf-8") as f:
        f.write(content)
    return f"Zapisano: {safe_path}"


def tool_read_file(filename: str) -> str:
    """Czyta plik z workspace."""
    safe_path = os.path.join(WORKSPACE, filename)
    if not os.path.abspath(safe_path).startswith(WORKSPACE):
        return "Błąd: ścieżka poza workspace."
    try:
        with open(safe_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"Błąd: {e}"


def tool_list_files(subdir: str = ".") -> str:
    """Listuje pliki w workspace."""
    target = os.path.join(WORKSPACE, subdir)
    try:
        return json.dumps(os.listdir(target), ensure_ascii=False)
    except Exception as e:
        return f"Błąd: {e}"


def tool_read_image_text(filename: str) -> str:
    """Czyta tekst ze zrzutu ekranu / zdjęcia przez OCR (nie prawdziwe widzenie — tylko tekst)."""
    try:
        import pytesseract
        from PIL import Image
    except ImportError:
        return ("OCR niedostępny — brakuje bibliotek. Zainstaluj: pip install pytesseract Pillow, "
                "oraz sam program Tesseract-OCR (https://github.com/UB-Mannheim/tesseract/wiki dla Windows).")

    safe_path = os.path.join(WORKSPACE, filename)
    if not os.path.abspath(safe_path).startswith(WORKSPACE):
        return "Błąd: ścieżka poza workspace. Wrzuć plik obrazu do folderu debrain_workspace."
    if not os.path.exists(safe_path):
        return f"Nie znaleziono pliku: {safe_path}. Upewnij się, że obraz jest w folderze {WORKSPACE}."

    try:
        img = Image.open(safe_path)
        text = pytesseract.image_to_string(img, lang="pol+eng")
        text = text.strip()
        if not text:
            return "OCR nie wykrył żadnego tekstu na obrazie."
        return text[:6000]
    except Exception as e:
        return f"Błąd OCR: {e}"


# ---------- Baza: odczyt i zapis ----------

def _fetch_baza_data():
    r = requests.get(
        f"https://{BAZA_DOMAIN}/api/baza-data",
        headers={"X-Panel-Password": BAZA_PIN},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _save_baza_data(data):
    r = requests.put(
        f"https://{BAZA_DOMAIN}/api/baza-data",
        headers={"X-Panel-Password": BAZA_PIN, "Content-Type": "application/json"},
        json=data,
        timeout=15,
    )
    r.raise_for_status()


def tool_read_baza_data() -> str:
    """Czyta dane z dashboardu Baza."""
    try:
        data = _fetch_baza_data()
        summary = {
            "priorytet_dnia": data.get("priority"),
            "zadania": data.get("todos", []),
            "lista_zakupow": data.get("shoppingList", []),
            "lista_filmow_do_obejrzenia": data.get("watchList", []),
            "kalorie_dzis": data.get("calories"),
            "nawyki_dzis": data.get("habits"),
            "streak_dni": (data.get("streak") or {}).get("count"),
            "xp": data.get("xp", 0),
            "ostatnie_notatki": (data.get("notes") or [])[:5],
        }
        return json.dumps(summary, ensure_ascii=False)
    except Exception as e:
        return f"Błąd odczytu danych Baza: {e}"


def tool_update_baza_data(action: str, text: str = None, habit_id: str = None, kcal: int = None, note: str = None) -> str:
    """Zapisuje coś do Bazy: add_todo, add_note, add_shopping_item, add_watch_item, add_calories, set_priority, toggle_habit."""
    try:
        import datetime
        data = _fetch_baza_data()
        now = datetime.datetime.utcnow().isoformat()
        today = now[:10]

        if action == "add_todo":
            if not text:
                return "Brak treści zadania."
            todo_item = {"text": text, "done": False, "id": int(datetime.datetime.now().timestamp() * 1000), "date": now}
            if note:
                todo_item["note"] = note
            data.setdefault("todos", []).insert(0, todo_item)
        elif action == "add_note":
            if not text:
                return "Brak treści notatki."
            data.setdefault("notes", []).insert(0, {"body": text, "id": int(datetime.datetime.now().timestamp() * 1000), "date": now})
        elif action == "add_shopping_item":
            if not text:
                return "Brak nazwy produktu."
            data.setdefault("shoppingList", []).insert(0, {"text": text, "done": False, "id": int(datetime.datetime.now().timestamp() * 1000)})
        elif action == "add_watch_item":
            if not text:
                return "Brak tytułu filmu."
            data.setdefault("watchList", []).insert(0, {"title": text, "done": False, "id": int(datetime.datetime.now().timestamp() * 1000)})
        elif action == "add_calories":
            if not kcal:
                return "Brak liczby kalorii."
            calories = data.get("calories") or {}
            if calories.get("date") != today:
                calories = {"date": today, "kcal": 0, "goal": calories.get("goal", 2500)}
            calories["kcal"] = max(0, calories.get("kcal", 0) + kcal)
            data["calories"] = calories
        elif action == "set_priority":
            if not text:
                return "Brak treści priorytetu."
            data["priority"] = {"text": text, "date": today}
        elif action == "toggle_habit":
            if not habit_id:
                return "Brak ID nawyku."
            habits = data.get("habits") or {}
            if habits.get("date") != today:
                habits = {"date": today, "done": {}}
            was_done = bool(habits.get("done", {}).get(habit_id))
            habits.setdefault("done", {})[habit_id] = not was_done
            data["habits"] = habits
            data["xp"] = max(0, data.get("xp", 0) + (-10 if was_done else 10))
        else:
            return "Nieznana akcja."

        _save_baza_data(data)
        return f'OK: wykonano "{action}".'
    except Exception as e:
        return f"Błąd zapisu do Bazy: {e}"


# ---------- Kalendarz ----------

def tool_read_calendar() -> str:
    """Czyta najbliższe wydarzenia z Google Calendar."""
    try:
        r = requests.get(f"https://{BAZA_DOMAIN}/api/calendar-events", timeout=15)
        data = r.json()
        if not data.get("connected"):
            return "Kalendarz Google nie jest połączony w Bazie."
        return json.dumps(data.get("events", []), ensure_ascii=False)
    except Exception as e:
        return f"Błąd odczytu kalendarza: {e}"


def tool_create_calendar_event(title: str, date: str, time: str = "") -> str:
    """Dodaje wydarzenie do Google Calendar."""
    try:
        r = requests.post(
            f"https://{BAZA_DOMAIN}/api/calendar-create",
            json={"title": title, "date": date, "time": time},
            timeout=15,
        )
        data = r.json()
        if data.get("error"):
            return f"Błąd: {data['error']}"
        return f'Dodano do kalendarza: "{title}" ({date}{" " + time if time else ""}).'
    except Exception as e:
        return f"Błąd dodawania do kalendarza: {e}"


# ---------- CRM (Sklep za Stodołą) ----------

def tool_read_crm_data() -> str:
    """Czyta dane z CRM firmy Sklep za Stodołą."""
    if not CRM_DOMAIN or not CRM_PANEL_PASSWORD:
        return "CRM nieskonfigurowany — brak CRM_DOMAIN lub CRM_PANEL_PASSWORD w zmiennych środowiskowych."
    try:
        r = requests.get(
            f"https://{CRM_DOMAIN}{CRM_API_PATH}",
            headers={"X-Panel-Password": CRM_PANEL_PASSWORD},
            timeout=15,
        )
        if not r.ok:
            return f"Błąd odczytu CRM (status {r.status_code}) — sprawdź CRM_API_PATH."
        data = r.json()
        summary = {
            "klienci_liczba": len(data.get("clients", [])) if isinstance(data.get("clients"), list) else None,
            "sprawy_w_toku": data.get("activeCases") or data.get("cases"),
            "terminy": data.get("deadlines") or data.get("terminy"),
            "instalacje": data.get("installations"),
        }
        return json.dumps(summary, ensure_ascii=False)
    except Exception as e:
        return f"Błąd odczytu CRM: {e}"


# ---------- Skarbiec notatek (vault) — lokalnie albo przez wspólny magazyn (jsonbin), zależnie od DEBRAIN_SYNC ----------

VAULT_DIR = os.path.join(WORKSPACE, "vault")


def _vault_list_local():
    if not os.path.isdir(VAULT_DIR):
        return []
    files = []
    for root, _, fnames in os.walk(VAULT_DIR):
        for fname in fnames:
            if fname.endswith(".md") or fname.endswith(".txt"):
                fpath = os.path.join(root, fname)
                files.append(os.path.relpath(fpath, VAULT_DIR))
    return files


def _vault_read_local(filename):
    fpath = os.path.join(VAULT_DIR, filename)
    if not os.path.abspath(fpath).startswith(VAULT_DIR):
        return None
    try:
        with open(fpath, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


def _vault_write_local(filename, content):
    fpath = os.path.join(VAULT_DIR, filename)
    if not os.path.abspath(fpath).startswith(VAULT_DIR):
        return
    os.makedirs(os.path.dirname(fpath), exist_ok=True)
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(content)


def vault_list():
    if SYNC_REMOTE:
        try:
            data = _remote_post("vaultList", {})
            return data.get("files", [])
        except Exception as e:
            print(f"(uwaga: synchronizacja skarbca nieudana, wracam do lokalnej: {e})")
    return _vault_list_local()


def vault_read(filename):
    if SYNC_REMOTE:
        try:
            data = _remote_post("vaultRead", {"filename": filename})
            return data.get("content")
        except Exception as e:
            print(f"(uwaga: synchronizacja skarbca nieudana, wracam do lokalnej: {e})")
    return _vault_read_local(filename)


def vault_write(filename, content):
    if SYNC_REMOTE:
        try:
            _remote_post("vaultWrite", {"filename": filename, "content": content})
            return
        except Exception as e:
            print(f"(uwaga: synchronizacja skarbca nieudana, zapisuję lokalnie: {e})")
    _vault_write_local(filename, content)


def migrate_local_vault_to_remote():
    """Wgrywa istniejące lokalne notatki do wspólnego magazynu (jednorazowo, przy starcie z DEBRAIN_SYNC=1)."""
    if not SYNC_REMOTE:
        return "Synchronizacja wyłączona."
    local_files = _vault_list_local()
    if not local_files:
        return "Brak lokalnych notatek do migracji."
    try:
        remote_files = set(_remote_post("vaultList", {}).get("files", []))
    except Exception as e:
        return f"Nie udało się połączyć ze wspólnym magazynem: {e}"
    migrated = 0
    for fname in local_files:
        if fname in remote_files:
            continue
        content = _vault_read_local(fname)
        if content is None:
            continue
        try:
            _remote_post("vaultWrite", {"filename": fname, "content": content})
            migrated += 1
        except Exception as e:
            print(f"(uwaga: nie udało się zmigrować {fname}: {e})")
    return f"Zmigrowano {migrated} notatek do wspólnego magazynu." if migrated else "Wszystkie notatki już były zsynchronizowane."


def tool_search_vault(query: str, max_results: int = 8) -> str:
    """Przeszukuje treść wszystkich notatek w skarbcu (jak wyszukiwarka po własnych notatkach)."""
    files = vault_list()
    if not files:
        return "Skarbiec jest jeszcze pusty — nie ma tam żadnych plików."
    query_lower = query.lower()
    results = []
    for rel_path in files:
        content = vault_read(rel_path)
        if not content:
            continue
        lines = content.split("\n")
        for i, line in enumerate(lines):
            if query_lower in line.lower():
                context_start = max(0, i - 1)
                context_end = min(len(lines), i + 2)
                snippet = "\n".join(lines[context_start:context_end]).strip()
                results.append({"plik": rel_path, "fragment": snippet[:400]})
                if len(results) >= max_results:
                    break
        if len(results) >= max_results:
            break
    if not results:
        return f"Brak wyników dla '{query}' w skarbcu."
    return json.dumps(results, ensure_ascii=False, indent=2)


def tool_list_vault_notes() -> str:
    """Listuje nazwy wszystkich notatek w skarbcu."""
    return json.dumps(vault_list(), ensure_ascii=False)


def tool_read_vault_note(filename: str) -> str:
    """Czyta pełną treść jednej notatki ze skarbca."""
    content = vault_read(filename)
    return content if content is not None else f"Nie znaleziono notatki: {filename}"


def tool_write_vault_note(filename: str, content: str) -> str:
    """Zapisuje/nadpisuje notatkę w skarbcu."""
    vault_write(filename, content)
    return f"Zapisano notatkę: {filename}"


def tool_sync_baza_notes_to_vault() -> str:
    """Kopiuje notatki z Bazy (zakładka Notatki) do skarbca jako osobne pliki .md, żeby były przeszukiwalne."""
    try:
        data = _fetch_baza_data()
        notes = data.get("notes", [])
        if not notes:
            return "Brak notatek w Bazie do zsynchronizowania."
        count = 0
        for n in notes:
            note_id = n.get("id", count)
            date = (n.get("date") or "")[:10]
            body = n.get("body", "").strip()
            if not body:
                continue
            fname = f"baza-notatki/{date}-{note_id}.md".replace(" ", "-")
            vault_write(fname, f"# Notatka z Bazy ({date})\n\n{body}\n")
            count += 1
        return f"Zsynchronizowano {count} notatek do vault/baza-notatki/."
    except Exception as e:
        return f"Błąd synchronizacji notatek: {e}"


def build_vault_graph():
    """Skanuje vault/ i buduje graf węzłów+krawędzi. Łączy notatki na dwa sposoby:
    1) Jawne odnośniki [[Nazwa Notatki]] (jeśli je piszesz — nadal działają, najsilniejszy sygnał)
    2) AUTOMATYCZNIE: jeśli tytuł jednej notatki pojawia się jako zwykły tekst w treści innej —
       dokładnie jak 'unlinked mentions' w Obsidianie. Nie musisz nic oznaczać nawiasami — samo
       napisanie np. 'Sklep za Stodołą' w dwóch różnych notatkach (z których jedna nazywa się
       właśnie tak) automatycznie je połączy."""
    if not SYNC_REMOTE and not os.path.isdir(VAULT_DIR):
        return {"nodes": [], "edges": []}

    note_files = {}
    note_content = {}
    for rel_path in vault_list():
        title = os.path.splitext(os.path.basename(rel_path))[0]
        key = title.lower()
        note_files[key] = {"id": rel_path, "label": title, "path": rel_path}
        note_content[key] = vault_read(rel_path) or ""

    edges = []
    edge_seen = {}
    link_pattern = re.compile(r"\[\[([^\]|#]+)")

    # 1) Jawne odnośniki [[...]] — najsilniejszy sygnał
    for title_key, content in note_content.items():
        for match in link_pattern.findall(content):
            target_key = match.strip().lower()
            if target_key in note_files and target_key != title_key:
                pair = tuple(sorted([note_files[title_key]["id"], note_files[target_key]["id"]]))
                edge_seen[pair] = {"type": "explicit"}

    # 2) Automatyczne — tytuł notatki B pojawia się jako tekst w treści notatki A (min. 4 znaki, żeby
    #    uniknąć fałszywych trafień na bardzo krótkie nazwy plików)
    keys = list(note_files.keys())
    for i in range(len(keys)):
        for j in range(len(keys)):
            if i == j:
                continue
            k_source, k_target = keys[i], keys[j]
            title_target = note_files[k_target]["label"]
            if len(title_target) < 4:
                continue
            title_words = [w for w in re.split(r"[-_\s]+", title_target) if w]
            if not title_words:
                continue
            pattern = r"\b" + r"[\s\-_]+".join(re.escape(w) for w in title_words) + r"\b"
            if re.search(pattern, note_content[k_source], re.IGNORECASE):
                pair = tuple(sorted([note_files[k_source]["id"], note_files[k_target]["id"]]))
                if pair not in edge_seen:
                    edge_seen[pair] = {"type": "auto"}

    for (a, b), meta in edge_seen.items():
        edges.append({"from": a, "to": b, "auto": meta["type"] == "auto"})

    linked_ids = set()
    for e in edges:
        linked_ids.add(e["from"])
        linked_ids.add(e["to"])

    nodes = [
        {"id": meta["id"], "label": meta["label"], "group": "połączona" if meta["id"] in linked_ids else "samotna"}
        for meta in note_files.values()
    ]
    return {"nodes": nodes, "edges": edges}


TOOLS_IMPL = {
    "web_search": tool_web_search,
    "run_python": tool_run_python,
    "run_shell": tool_run_shell,
    "write_file": tool_write_file,
    "read_file": tool_read_file,
    "list_files": tool_list_files,
    "read_image_text": tool_read_image_text,
    "read_baza_data": tool_read_baza_data,
    "update_baza_data": tool_update_baza_data,
    "read_calendar": tool_read_calendar,
    "create_calendar_event": tool_create_calendar_event,
    "read_crm_data": tool_read_crm_data,
    "search_vault": tool_search_vault,
    "list_vault_notes": tool_list_vault_notes,
    "read_vault_note": tool_read_vault_note,
    "write_vault_note": tool_write_vault_note,
    "sync_baza_notes_to_vault": tool_sync_baza_notes_to_vault,
}

TOOLS_SCHEMA = [
    {"type": "function", "function": {
        "name": "web_search",
        "description": "Szuka aktualnych informacji w internecie.",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "Zapytanie do wyszukania"},
            "max_results": {"type": "integer", "description": "Liczba wyników (domyślnie 5)"},
        }, "required": ["query"]},
    }},
    {"type": "function", "function": {
        "name": "run_python",
        "description": "Wykonuje kod Python i zwraca wynik (stdout/stderr).",
        "parameters": {"type": "object", "properties": {
            "code": {"type": "string", "description": "Kod Python do wykonania"},
        }, "required": ["code"]},
    }},
    {"type": "function", "function": {
        "name": "run_shell",
        "description": "Wykonuje komendę shell/bash (np. pip install, git, ls).",
        "parameters": {"type": "object", "properties": {
            "command": {"type": "string", "description": "Komenda do wykonania"},
        }, "required": ["command"]},
    }},
    {"type": "function", "function": {
        "name": "write_file",
        "description": "Zapisuje plik w workspace agenta.",
        "parameters": {"type": "object", "properties": {
            "filename": {"type": "string"},
            "content": {"type": "string"},
        }, "required": ["filename", "content"]},
    }},
    {"type": "function", "function": {
        "name": "read_file",
        "description": "Czyta plik z workspace agenta.",
        "parameters": {"type": "object", "properties": {
            "filename": {"type": "string"},
        }, "required": ["filename"]},
    }},
    {"type": "function", "function": {
        "name": "list_files",
        "description": "Listuje pliki w workspace agenta.",
        "parameters": {"type": "object", "properties": {
            "subdir": {"type": "string"},
        }},
    }},
    {"type": "function", "function": {
        "name": "read_image_text",
        "description": "Czyta tekst ze zrzutu ekranu lub zdjęcia (OCR) znajdującego się w workspace. To NIE jest pełne widzenie obrazu — działa dobrze na screenshoty z tekstem (błędy, konsole, logi), słabo na grafikę bez tekstu.",
        "parameters": {"type": "object", "properties": {
            "filename": {"type": "string", "description": "Nazwa pliku obrazu w workspace (np. 'screenshot.png')"},
        }, "required": ["filename"]},
    }},
    {"type": "function", "function": {
        "name": "read_baza_data",
        "description": "Czyta aktualne dane z dashboardu Baza: priorytet dnia, zadania do zrobienia, listę zakupów, listę filmów do obejrzenia, kalorie zjedzone dzisiaj i dzienny cel, postęp nawyków dzisiaj, streak, XP, ostatnie notatki.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "update_baza_data",
        "description": "Zapisuje coś do dashboardu Baza.",
        "parameters": {"type": "object", "properties": {
            "action": {"type": "string", "enum": ["add_todo", "add_note", "add_shopping_item", "add_watch_item", "add_calories", "set_priority", "toggle_habit"], "description": "Rodzaj akcji"},
            "text": {"type": "string", "description": "Treść zadania / notatki / produktu / tytułu filmu / priorytetu dnia"},
            "kcal": {"type": "integer", "description": "Liczba kalorii do dodania (tylko dla add_calories)"},
            "note": {"type": "string", "description": "Opcjonalna notatka do zadania, np. kiedy je zrobisz ('zrobię w poniedziałek', 'odłożone, spróbuj jutro') — tylko dla add_todo"},
            "habit_id": {"type": "string", "description": "ID nawyku do odznaczenia (format 'hNN', np. 'h1')"},
        }, "required": ["action"]},
    }},
    {"type": "function", "function": {
        "name": "read_calendar",
        "description": "Czyta najbliższe wydarzenia z Google Calendar (7 dni do przodu).",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "create_calendar_event",
        "description": "Dodaje wydarzenie do Google Calendar.",
        "parameters": {"type": "object", "properties": {
            "title": {"type": "string", "description": "Tytuł wydarzenia"},
            "date": {"type": "string", "description": "Data w formacie YYYY-MM-DD"},
            "time": {"type": "string", "description": "Godzina HH:MM (opcjonalnie)"},
        }, "required": ["title", "date"]},
    }},
    {"type": "function", "function": {
        "name": "read_crm_data",
        "description": "Czyta dane z CRM firmy Sklep za Stodołą: klientów, sprawy w toku, terminy, instalacje mlekomatów.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "search_vault",
        "description": "Przeszukuje treść wszystkich notatek w skarbcu (folder vault/) — jak wyszukiwarka po własnej bazie wiedzy. Używaj gdy Kuba pyta co kiedyś pisał/notował o czymś, albo szuka powiązań między tematami.",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "Czego szukać w treści notatek"},
            "max_results": {"type": "integer", "description": "Maksymalna liczba dopasowań (domyślnie 8)"},
        }, "required": ["query"]},
    }},
    {"type": "function", "function": {
        "name": "list_vault_notes",
        "description": "Listuje nazwy wszystkich notatek w skarbcu.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "read_vault_note",
        "description": "Czyta pełną treść jednej notatki ze skarbca.",
        "parameters": {"type": "object", "properties": {
            "filename": {"type": "string", "description": "Nazwa pliku notatki"},
        }, "required": ["filename"]},
    }},
    {"type": "function", "function": {
        "name": "write_vault_note",
        "description": "Zapisuje/nadpisuje notatkę w skarbcu.",
        "parameters": {"type": "object", "properties": {
            "filename": {"type": "string"},
            "content": {"type": "string"},
        }, "required": ["filename", "content"]},
    }},
    {"type": "function", "function": {
        "name": "sync_baza_notes_to_vault",
        "description": "Kopiuje notatki z zakładki Notatki w Bazie do skarbca jako osobne pliki .md, żeby stały się przeszukiwalne przez search_vault.",
        "parameters": {"type": "object", "properties": {}},
    }},
]


# ---------- PAMIĘĆ TRWAŁA ----------

def load_memory():
    """Zwraca (history, last_greeting_date). Obsługuje też stary format (sama lista wiadomości)."""
    if os.path.exists(MEMORY_FILE):
        try:
            with open(MEMORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "history" in data:
                    history = data["history"] or [{"role": "system", "content": SYSTEM_PROMPT}]
                    return history, data.get("last_greeting_date")
                if isinstance(data, list) and data:  # stary format, sama lista wiadomości
                    return data, None
        except Exception:
            pass
    return [{"role": "system", "content": SYSTEM_PROMPT}], None


def save_memory(history, last_greeting_date=None):
    try:
        with open(MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump({"history": history, "last_greeting_date": last_greeting_date}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"(uwaga: nie udało się zapisać pamięci: {e})")


# ---------- WIELE ROZMÓW W FOLDERACH (używane przez GUI) ----------

import uuid

CHATS_FILE = os.path.join(WORKSPACE, "chats.json")


def _new_id():
    return uuid.uuid4().hex[:12]


def _empty_store():
    return {"folders": {}, "chats": {}, "active_chat_id": None, "last_greeting_date": None}


def load_chats_store():
    """Wczytuje magazyn wielu rozmów. Jeśli nie istnieje, próbuje zmigrować starą pojedynczą pamięć (memory.json)."""
    if os.path.exists(CHATS_FILE):
        try:
            with open(CHATS_FILE, "r", encoding="utf-8") as f:
                store = json.load(f)
            store.setdefault("folders", {})
            store.setdefault("chats", {})
            store.setdefault("active_chat_id", None)
            store.setdefault("last_greeting_date", None)
            return store
        except Exception:
            pass

    # Migracja ze starego formatu (jedna rozmowa w memory.json)
    store = _empty_store()
    old_history, old_greeting = load_memory()
    real_msgs = [m for m in old_history if m.get("role") != "system"]
    now = datetime.datetime.utcnow().isoformat()
    chat_id = _new_id()
    store["chats"][chat_id] = {
        "title": "Rozmowa",
        "folder_id": None,
        "history": real_msgs,
        "created": now,
        "updated": now,
    }
    store["active_chat_id"] = chat_id
    store["last_greeting_date"] = old_greeting
    save_chats_store(store)
    return store


def save_chats_store(store):
    try:
        with open(CHATS_FILE, "w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"(uwaga: nie udało się zapisać rozmów: {e})")


def list_chats_meta(store):
    """Lekka lista do sidebaru — bez pełnej historii."""
    folders = [{"id": fid, "name": f["name"]} for fid, f in store["folders"].items()]
    chats = [
        {"id": cid, "title": c.get("title") or "Nowa rozmowa", "folder_id": c.get("folder_id"), "updated": c.get("updated")}
        for cid, c in store["chats"].items()
    ]
    chats.sort(key=lambda c: c["updated"] or "", reverse=True)
    return folders, chats


def create_chat(store, folder_id=None, title="Nowa rozmowa"):
    now = datetime.datetime.utcnow().isoformat()
    chat_id = _new_id()
    store["chats"][chat_id] = {"title": title, "folder_id": folder_id, "history": [], "created": now, "updated": now}
    store["active_chat_id"] = chat_id
    save_chats_store(store)
    return chat_id


def delete_chat(store, chat_id):
    store["chats"].pop(chat_id, None)
    if store.get("active_chat_id") == chat_id:
        remaining = list(store["chats"].keys())
        store["active_chat_id"] = remaining[0] if remaining else None
    save_chats_store(store)


def rename_chat(store, chat_id, title):
    if chat_id in store["chats"]:
        store["chats"][chat_id]["title"] = title
        save_chats_store(store)


def move_chat(store, chat_id, folder_id):
    if chat_id in store["chats"]:
        store["chats"][chat_id]["folder_id"] = folder_id
        save_chats_store(store)


def create_folder(store, name):
    folder_id = _new_id()
    store["folders"][folder_id] = {"name": name}
    save_chats_store(store)
    return folder_id


def rename_folder(store, folder_id, name):
    if folder_id in store["folders"]:
        store["folders"][folder_id]["name"] = name
        save_chats_store(store)


def delete_folder(store, folder_id):
    store["folders"].pop(folder_id, None)
    for c in store["chats"].values():
        if c.get("folder_id") == folder_id:
            c["folder_id"] = None
    save_chats_store(store)


# ---------- Jednolita warstwa lokalna/zdalna (używana przez gui_app.py) ----------
# Ustaw DEBRAIN_SYNC=1 w .env, żeby desktop czytał/pisał do tego samego magazynu co web
# (ta sama domena decz.pl, ten sam jsonbin) zamiast lokalnego pliku chats.json.

SYNC_REMOTE = os.environ.get("DEBRAIN_SYNC") == "1"


def _remote_get(action_url_suffix=""):
    r = requests.get(f"https://{BAZA_DOMAIN}/api/debrain-memory{action_url_suffix}", timeout=15)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(f"Serwer zwrócił błąd: {data['error']}")
    return data


def _remote_post(action, payload=None):
    r = requests.post(
        f"https://{BAZA_DOMAIN}/api/debrain-memory",
        json={"action": action, "payload": payload or {}},
        timeout=20,
    )
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(f"Serwer zwrócił błąd: {data['error']}")
    return data


def chats_get_state():
    """Zwraca (folders, chats_meta, active_chat_id)."""
    if SYNC_REMOTE:
        try:
            data = _remote_get()
            return data.get("folders", []), data.get("chats", []), data.get("activeChatId")
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana, wracam do lokalnej pamięci: {e})")
    store = load_chats_store()
    folders, chats = list_chats_meta(store)
    chats = [{"id": c["id"], "title": c["title"], "folderId": c["folder_id"], "updated": c["updated"]} for c in chats]
    return folders, chats, store.get("active_chat_id")


def chats_get_chat(chat_id):
    """Zwraca (title, folder_id, history)."""
    if SYNC_REMOTE:
        try:
            data = _remote_post("getChat", {"chatId": chat_id})
            return data.get("title"), data.get("folderId"), data.get("history", [])
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    chat = store["chats"].get(chat_id, {})
    return chat.get("title"), chat.get("folder_id"), chat.get("history", [])


def chats_create_chat(folder_id=None, title="Nowa rozmowa"):
    if SYNC_REMOTE:
        try:
            data = _remote_post("createChat", {"folderId": folder_id, "title": title})
            return data.get("id")
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    return create_chat(store, folder_id=folder_id, title=title)


def chats_delete_chat(chat_id):
    if SYNC_REMOTE:
        try:
            data = _remote_post("deleteChat", {"chatId": chat_id})
            return data.get("activeChatId")
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    delete_chat(store, chat_id)
    return store.get("active_chat_id")


def chats_rename_chat(chat_id, title):
    if SYNC_REMOTE:
        try:
            _remote_post("renameChat", {"chatId": chat_id, "title": title})
            return
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    rename_chat(store, chat_id, title)


def chats_move_chat(chat_id, folder_id):
    if SYNC_REMOTE:
        try:
            _remote_post("moveChat", {"chatId": chat_id, "folderId": folder_id})
            return
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    move_chat(store, chat_id, folder_id)


def chats_create_folder(name):
    if SYNC_REMOTE:
        try:
            data = _remote_post("createFolder", {"name": name})
            return data.get("id")
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    return create_folder(store, name)


def chats_rename_folder(folder_id, name):
    if SYNC_REMOTE:
        try:
            _remote_post("renameFolder", {"folderId": folder_id, "name": name})
            return
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    rename_folder(store, folder_id, name)


def chats_delete_folder(folder_id):
    if SYNC_REMOTE:
        try:
            _remote_post("deleteFolder", {"folderId": folder_id})
            return
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    delete_folder(store, folder_id)


def chats_set_active(chat_id):
    if SYNC_REMOTE:
        try:
            _remote_post("setActive", {"chatId": chat_id})
            return
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    store["active_chat_id"] = chat_id
    save_chats_store(store)


def chats_save_history(chat_id, history):
    """Zapisuje historię, zwraca (ewentualnie zaktualizowany) tytuł rozmowy."""
    if SYNC_REMOTE:
        try:
            data = _remote_post("saveChatHistory", {"chatId": chat_id, "history": history})
            return data.get("title")
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    chat = store["chats"].get(chat_id)
    if chat is not None:
        chat["history"] = history
        chat["updated"] = datetime.datetime.utcnow().isoformat()
        if chat.get("title") in (None, "", "Nowa rozmowa"):
            first_user = next((m for m in history if m.get("role") == "user"), None)
            if first_user:
                t = first_user["content"].strip().replace("\n", " ")
                chat["title"] = (t[:42] + "…") if len(t) > 42 else t
        save_chats_store(store)
        return chat["title"]
    return None


def chats_get_greeting_status():
    if SYNC_REMOTE:
        try:
            data = _remote_post("getGreetingStatus", {})
            return data.get("lastGreetingDate")
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    return store.get("last_greeting_date")


def chats_set_greeting_date(date):
    if SYNC_REMOTE:
        try:
            _remote_post("setGreetingDate", {"date": date})
            return
        except Exception as e:
            print(f"(uwaga: synchronizacja nieudana: {e})")
    store = load_chats_store()
    store["last_greeting_date"] = date
    save_chats_store(store)


# ---------- PĘTLA AGENTA ----------

def call_deepseek(messages, model):
    if not API_KEY:
        print("BŁĄD: brak DEEPSEEK_API_KEY w zmiennych środowiskowych.")
        sys.exit(1)
    resp = requests.post(
        API_URL,
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        json={"model": model, "messages": messages, "tools": TOOLS_SCHEMA, "temperature": 0.4},
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()


def run_agent_stream(user_message: str, history=None, model=DEFAULT_MODEL):
    """Generator: yielduje kroki (użycia narzędzi) na bieżąco, na końcu yielduje wynik finalny.
    Zdarzenia: {"type": "tool_start", "name":..., "args":...}, {"type": "tool_end", "name":...},
    {"type": "final", "reply":..., "history":...}."""
    messages = history or [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.append({"role": "user", "content": user_message})

    for _ in range(12):  # więcej iteracji — pomaga przy dłuższym, wieloetapowym debugowaniu
        data = call_deepseek(messages, model)
        choice = data["choices"][0]["message"]
        messages.append(choice)

        tool_calls = choice.get("tool_calls")
        if not tool_calls:
            yield {"type": "final", "reply": choice.get("content", ""), "history": messages}
            return

        for tc in tool_calls:
            fn_name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"])
            except json.JSONDecodeError:
                args = {}
            yield {"type": "tool_start", "name": fn_name, "args": args}
            impl = TOOLS_IMPL.get(fn_name)
            result = impl(**args) if impl else f"Nieznane narzędzie: {fn_name}"
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": str(result)[:6000],
            })
            yield {"type": "tool_end", "name": fn_name}

    yield {"type": "final", "reply": "Osiągnięto limit iteracji narzędzi — zadanie może wymagać podzielenia na mniejsze kroki.", "history": messages}


def run_agent(user_message: str, history=None, model=DEFAULT_MODEL, verbose=True):
    """Wrapper bez strumieniowania — używany przez CLI (terminal drukuje kroki na bieżąco przez print)."""
    final = None
    for event in run_agent_stream(user_message, history=history, model=model):
        if verbose and event["type"] == "tool_start":
            print(f"  🔧 {event['name']}({event['args']})")
        if event["type"] == "final":
            final = event
    return final["reply"], final["history"]


GREETING_PROMPT = ("[Nowy dzień] Przywitaj się krótko, po swojemu. Następnie podaj jeden cytat "
                    "motywacyjny (dowolny autor, po polsku lub z tłumaczeniem) oraz jedną naprawdę niszową, "
                    "mało znaną ciekawostkę o świecie — coś, czego większość ludzi nie słyszała, nie oczywiste "
                    "jak 'miód nie psuje się'. Bądź zwięzły, bez gwiazdek.")


def today_str():
    return datetime.date.today().isoformat()


# ---------- Automatyzacja: sync, ocena sesji, konsolidacja (używane przez scheduler w gui_app.py) ----------

SCHEDULER_STATE_FILE = os.path.join(WORKSPACE, "scheduler_state.json")

AUTO_MEMORY_REVIEW_PROMPT = (
    "[Automatyczna ocena sesji — działa w tle, bez udziału Kuby] Przejrzyj tę rozmowę. Czy wydarzyło się coś "
    "genialnie nowego i wartego zapamiętania na przyszłość — coś co zajęło dużo czasu odkryć, poprawkę błędnego "
    "założenia, potwierdzone podejście? Jeśli tak, zapisz JEDEN zwięzły plik w memory/ zgodnie z zasadami "
    "protokołu (sprawdź najpierw czy już nie istnieje, jednolinijkowe podsumowanie na górze). Jeśli nic w tej "
    "rozmowie nie jest tego warte, NIC nie rób — nie pisz żadnego pliku, nie odpowiadaj żadnym tekstem, po prostu "
    "zakończ. To działa automatycznie w tle, więc bądź bardzo selektywny — większość sesji nie zasługuje na wpis."
)

AUTO_CONSOLIDATE_PROMPT = (
    "[Automatyczna konsolidacja — działa w tle, bez udziału Kuby] Przejrzyj wszystkie pliki w memory/. Połącz te "
    "o tym samym temacie w jeden gęstszy plik i usuń duplikaty. Usuń całkowicie lekcje, które są nieaktualne albo "
    "błędne. Jeśli folder jest pusty albo nie ma nic do skonsolidowania, nic nie rób."
)


def load_scheduler_state():
    default = {"last_baza_sync": None, "last_consolidate": None, "chat_memory_reviewed": {}}
    if os.path.exists(SCHEDULER_STATE_FILE):
        try:
            with open(SCHEDULER_STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                default.update(data)
        except Exception:
            pass
    return default


def save_scheduler_state(state):
    try:
        with open(SCHEDULER_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"(uwaga: nie udało się zapisać stanu schedulera: {e})")


def run_silent_agent_task(prompt, model=None):
    """Uruchamia zadanie w tle bez zapisywania do żadnej rozmowy — tylko efekty uboczne (pliki)."""
    m = model or DEFAULT_MODEL
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    try:
        answer, _ = run_agent(prompt, history=messages, model=m, verbose=False)
        return answer
    except Exception as e:
        return f"Błąd zadania w tle: {e}"
