#!/usr/bin/env python3
"""
Debrain — twój własny agent AI (mózg: DeepSeek V3.2)
Umie: pisać/wykonywać kod, przeszukiwać sieć, czytać/zapisywać pliki.

Setup:
    pip install requests beautifulsoup4 python-dotenv
    export DEEPSEEK_API_KEY="twój_klucz"   # https://platform.deepseek.com
    python debrain.py

Użycie:
    python debrain.py                  -> tryb interaktywny (rozmowa)
    python debrain.py "zadanie tutaj"  -> tryb jednorazowy
"""

import os
import sys
import json
import subprocess
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ.get("DEEPSEEK_API_KEY")
API_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-chat"  # DeepSeek V3.2. Użyj "deepseek-reasoner" dla trudniejszych zadań.

WORKSPACE = os.path.abspath(os.environ.get("DEBRAIN_WORKSPACE", "./debrain_workspace"))
os.makedirs(WORKSPACE, exist_ok=True)

SYSTEM_PROMPT = """Jesteś Debrain — osobisty agent AI Kuby. Mówisz po polsku, zwięźle, konkretnie,
bez zbędnego lania wody. Dajesz gotowe, praktyczne rozwiązania (copy-paste ready), nie rozwodzisz się
nad oczywistościami. Masz dostęp do narzędzi: przeszukiwania sieci, wykonywania kodu Python,
czytania/zapisu plików w swoim workspace. Używaj ich proaktywnie, kiedy potrzebujesz aktualnych
informacji albo musisz coś policzyć/przetestować/zbudować — nie zgaduj, sprawdzaj."""


# ---------- NARZĘDZIA ----------

def tool_web_search(query: str, max_results: int = 5) -> str:
    """Szuka w sieci przez DuckDuckGo (bez klucza API)."""
    try:
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


TOOLS_IMPL = {
    "web_search": tool_web_search,
    "run_python": tool_run_python,
    "run_shell": tool_run_shell,
    "write_file": tool_write_file,
    "read_file": tool_read_file,
    "list_files": tool_list_files,
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
]


# ---------- PĘTLA AGENTA ----------

def call_deepseek(messages):
    if not API_KEY:
        print("BŁĄD: brak DEEPSEEK_API_KEY w zmiennych środowiskowych.")
        sys.exit(1)
    resp = requests.post(
        API_URL,
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        json={"model": MODEL, "messages": messages, "tools": TOOLS_SCHEMA, "temperature": 0.4},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def run_agent(user_message: str, history=None, verbose=True):
    messages = history or [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.append({"role": "user", "content": user_message})

    for _ in range(8):  # max 8 iteracji narzędzi na turę
        data = call_deepseek(messages)
        choice = data["choices"][0]["message"]
        messages.append(choice)

        tool_calls = choice.get("tool_calls")
        if not tool_calls:
            return choice.get("content", ""), messages

        for tc in tool_calls:
            fn_name = tc["function"]["name"]
            try:
                args = json.loads(tc["function"]["arguments"])
            except json.JSONDecodeError:
                args = {}
            if verbose:
                print(f"  🔧 {fn_name}({args})")
            impl = TOOLS_IMPL.get(fn_name)
            result = impl(**args) if impl else f"Nieznane narzędzie: {fn_name}"
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": str(result)[:6000],
            })

    return "⚠️ Osiągnięto limit iteracji narzędzi.", messages


def main():
    if len(sys.argv) > 1:
        task = " ".join(sys.argv[1:])
        answer, _ = run_agent(task)
        print("\n" + answer)
        return

    print("🧠 Debrain gotowy. (model: DeepSeek V3.2, workspace:", WORKSPACE, ")")
    print("Wpisz 'exit' żeby wyjść.\n")
    history = [{"role": "system", "content": SYSTEM_PROMPT}]
    while True:
        try:
            user_input = input("Ty: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if user_input.lower() in ("exit", "quit", "q"):
            break
        if not user_input:
            continue
        answer, history = run_agent(user_input, history=history)
        print(f"\nDebrain: {answer}\n")


if __name__ == "__main__":
    main()
