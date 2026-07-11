#!/usr/bin/env python3
"""
gui_app.py — lokalny interfejs graficzny dla Debraina, z folderami i wieloma rozmowami.
Jeśli w .env ustawisz DEBRAIN_SYNC=1, korzysta z TEGO SAMEGO magazynu co wersja webowa
(decz.pl) — rozmowa zaczęta na telefonie/komputerze będzie widoczna tutaj i odwrotnie.
Bez tego ustawienia działa lokalnie (plik chats.json), tak jak wcześniej.

Uruchamianie:
    dwuklik na start_debrain.bat (Windows)
    albo:  python gui_app.py
"""

import os
import json
import subprocess
import threading
import time
import webbrowser
import datetime
from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context

import agent_core as core

app = Flask(__name__, static_folder=None)
PORT = 5077

STATE = {"model": core.DEFAULT_MODEL}

# ---------- Ustawienia automatyzacji (zmień w .env jeśli chcesz inne wartości) ----------
AUTO_SYNC_HOURS = float(os.environ.get("DEBRAIN_AUTO_SYNC_HOURS", "6"))
AUTO_CONSOLIDATE_DAYS = float(os.environ.get("DEBRAIN_AUTO_CONSOLIDATE_DAYS", "7"))
AUTO_MEMORY_IDLE_MINUTES = float(os.environ.get("DEBRAIN_AUTO_MEMORY_IDLE_MINUTES", "20"))
AUTO_MEMORY_MIN_MESSAGES = int(os.environ.get("DEBRAIN_AUTO_MEMORY_MIN_MESSAGES", "6"))
SCHEDULER_CHECK_INTERVAL_SECONDS = 600  # co ile sprawdza, czy czas na coś (10 min)


@app.route("/")
def index():
    return send_from_directory(".", "debrain_gui.html")


@app.route("/vault-graph.html")
def vault_graph_page():
    return send_from_directory(".", "vault_graph.html")


@app.route("/api/vault-graph", methods=["GET"])
def vault_graph_data():
    return jsonify(core.build_vault_graph())


@app.route("/api/vault-note", methods=["GET"])
def vault_note_content():
    rel_path = request.args.get("path", "")
    content = core.vault_read(rel_path)
    return jsonify({"content": content if content is not None else "(nie znaleziono)"})


# ---------- Stan startowy ----------

@app.route("/api/state", methods=["GET"])
def get_state():
    folders, chats, active_chat_id = core.chats_get_state()
    return jsonify({"folders": folders, "chats": chats, "activeChatId": active_chat_id, "model": STATE["model"]})


@app.route("/api/active", methods=["POST"])
def set_active():
    body = request.get_json(force=True)
    core.chats_set_active(body.get("chatId"))
    return jsonify({"ok": True})


# ---------- Czaty ----------

@app.route("/api/chats/<chat_id>", methods=["GET"])
def get_chat(chat_id):
    title, folder_id, history = core.chats_get_chat(chat_id)
    if title is None and not history:
        return jsonify({"error": "Nie znaleziono rozmowy."}), 404
    return jsonify({"id": chat_id, "title": title, "folderId": folder_id, "history": history})


@app.route("/api/chats", methods=["POST"])
def new_chat():
    body = request.get_json(force=True) or {}
    chat_id = core.chats_create_chat(folder_id=body.get("folderId"), title=body.get("title") or "Nowa rozmowa")
    return jsonify({"id": chat_id})


@app.route("/api/chats/<chat_id>", methods=["DELETE"])
def remove_chat(chat_id):
    active_chat_id = core.chats_delete_chat(chat_id)
    return jsonify({"ok": True, "activeChatId": active_chat_id})


@app.route("/api/chats/<chat_id>/rename", methods=["POST"])
def rename_chat_route(chat_id):
    body = request.get_json(force=True)
    core.chats_rename_chat(chat_id, body.get("title", "").strip() or "Nowa rozmowa")
    return jsonify({"ok": True})


@app.route("/api/chats/<chat_id>/move", methods=["POST"])
def move_chat_route(chat_id):
    body = request.get_json(force=True)
    core.chats_move_chat(chat_id, body.get("folderId"))
    return jsonify({"ok": True})


# ---------- Foldery ----------

@app.route("/api/folders", methods=["POST"])
def new_folder():
    body = request.get_json(force=True)
    name = (body.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Brak nazwy folderu."}), 400
    folder_id = core.chats_create_folder(name)
    return jsonify({"id": folder_id})


@app.route("/api/folders/<folder_id>", methods=["DELETE"])
def remove_folder(folder_id):
    core.chats_delete_folder(folder_id)
    return jsonify({"ok": True})


@app.route("/api/folders/<folder_id>/rename", methods=["POST"])
def rename_folder_route(folder_id):
    body = request.get_json(force=True)
    core.chats_rename_folder(folder_id, body.get("name", "").strip() or "Folder")
    return jsonify({"ok": True})


# ---------- Rozmowa z modelem ----------

@app.route("/api/chat", methods=["POST"])
def chat():
    body = request.get_json(force=True)
    chat_id = body.get("chatId")
    history = body.get("history") or []
    requested_model = body.get("model")
    if requested_model in ("deepseek-chat", "deepseek-reasoner"):
        STATE["model"] = requested_model

    if not chat_id:
        return jsonify({"error": "Brak chatId."}), 400
    if not history or history[-1]["role"] != "user":
        return jsonify({"error": "Brak wiadomości użytkownika w history."}), 400

    last_user_msg = history[-1]["content"]
    history_without_last = history[:-1]
    full_prior = [{"role": "system", "content": core.SYSTEM_PROMPT}] + history_without_last
    model = STATE["model"]

    def generate():
        for event in core.run_agent_stream(last_user_msg, history=full_prior, model=model):
            if event["type"] == "final":
                updated_history = [m for m in event["history"] if m.get("role") != "system"]
                core.chats_save_history(chat_id, updated_history)
                yield json.dumps({"type": "final", "reply": event["reply"], "history": updated_history, "model": model}, ensure_ascii=False) + "\n"
            else:
                yield json.dumps(event, ensure_ascii=False) + "\n"

    return Response(stream_with_context(generate()), mimetype="application/x-ndjson")


@app.route("/api/greeting", methods=["POST"])
def greeting():
    body = request.get_json(force=True) or {}
    chat_id = body.get("chatId")
    today = core.today_str()
    last_greeting_date = core.chats_get_greeting_status()

    if last_greeting_date == today or not chat_id:
        return jsonify({"skip": True})

    _, _, chat_history = core.chats_get_chat(chat_id)
    full_history = [{"role": "system", "content": core.SYSTEM_PROMPT}] + chat_history
    answer, updated_full = core.run_agent(
        core.GREETING_PROMPT, history=full_history, model=STATE["model"], verbose=False
    )
    updated_history = [m for m in updated_full if m.get("role") != "system"]
    core.chats_save_history(chat_id, updated_history)
    core.chats_set_greeting_date(today)

    return jsonify({"skip": False, "reply": answer, "history": updated_history})


def open_browser():
    url = f"http://127.0.0.1:{PORT}"
    app_mode_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "google-chrome",
        "chromium-browser",
    ]
    for path in app_mode_paths:
        if path and (os.path.exists(path) or path in ("google-chrome", "chromium-browser")):
            try:
                subprocess.Popen([path, f"--app={url}", "--window-size=1000,900"])
                return
            except Exception:
                continue
    webbrowser.open(url)


def _parse_iso(s):
    if not s:
        return None
    try:
        return datetime.datetime.fromisoformat(s)
    except Exception:
        return None


def background_maintenance_loop():
    """Działa w tle przez cały czas gdy appka jest uruchomiona: auto-sync notatek z Bazy,
    auto-ocena sesji pod kątem trwałych lekcji, auto-konsolidacja raz w tygodniu."""
    while True:
        try:
            now = datetime.datetime.utcnow()
            state = core.load_scheduler_state()
            changed = False

            # 1) Auto-sync notatek z Bazy
            last_sync = _parse_iso(state.get("last_baza_sync"))
            if last_sync is None or (now - last_sync).total_seconds() >= AUTO_SYNC_HOURS * 3600:
                result = core.tool_sync_baza_notes_to_vault()
                print(f"[scheduler] auto-sync notatek: {result}")
                state["last_baza_sync"] = now.isoformat()
                changed = True

            # 2) Auto-konsolidacja pamięci (raz na AUTO_CONSOLIDATE_DAYS dni)
            last_consolidate = _parse_iso(state.get("last_consolidate"))
            if last_consolidate is None or (now - last_consolidate).total_seconds() >= AUTO_CONSOLIDATE_DAYS * 86400:
                result = core.run_silent_agent_task(core.AUTO_CONSOLIDATE_PROMPT, model=STATE["model"])
                print(f"[scheduler] auto-konsolidacja: {result[:200]}")
                state["last_consolidate"] = now.isoformat()
                changed = True

            # 3) Auto-ocena zakończonych sesji pod kątem trwałych lekcji
            reviewed = state.setdefault("chat_memory_reviewed", {})
            _, chats_meta, _ = core.chats_get_state()
            for chat_meta in chats_meta:
                chat_id = chat_meta["id"]
                updated_str = chat_meta.get("updated")
                updated_dt = _parse_iso(updated_str)
                if not updated_dt:
                    continue
                idle_minutes = (now - updated_dt).total_seconds() / 60
                already_reviewed_at = reviewed.get(chat_id)
                if idle_minutes >= AUTO_MEMORY_IDLE_MINUTES and already_reviewed_at != updated_str:
                    _, _, history = core.chats_get_chat(chat_id)
                    if len(history) >= AUTO_MEMORY_MIN_MESSAGES:
                        result = core.run_silent_agent_task(
                            f"{core.AUTO_MEMORY_REVIEW_PROMPT}\n\n--- TREŚĆ ROZMOWY ---\n" +
                            "\n".join(f"{m['role']}: {m.get('content','')}" for m in history if m.get("content")),
                            model=STATE["model"],
                        )
                        print(f"[scheduler] auto-ocena rozmowy '{chat_meta.get('title')}': {result[:200]}")
                    reviewed[chat_id] = updated_str
                    changed = True

            if changed:
                core.save_scheduler_state(state)
        except Exception as e:
            print(f"[scheduler] błąd: {e}")

        time.sleep(SCHEDULER_CHECK_INTERVAL_SECONDS)


if __name__ == "__main__":
    if not core.API_KEY:
        print("BŁĄD: brak DEEPSEEK_API_KEY. Skopiuj .env.example do .env i wpisz tam klucz.")
        input("Naciśnij Enter, żeby zamknąć…")
        raise SystemExit(1)

    print(f"Debrain wystartował: http://127.0.0.1:{PORT}")
    if core.SYNC_REMOTE:
        print(f"Synchronizacja WŁĄCZONA — ten sam magazyn co decz.pl ({core.BAZA_DOMAIN})")
        migration_result = core.migrate_local_vault_to_remote()
        print(f"Migracja skarbca: {migration_result}")
    else:
        print("Synchronizacja wyłączona — pamięć tylko lokalna (ustaw DEBRAIN_SYNC=1 w .env, żeby włączyć)")
    print(f"Automatyzacja w tle: sync notatek co {AUTO_SYNC_HOURS}h, konsolidacja co {AUTO_CONSOLIDATE_DAYS}dni, "
          f"ocena sesji po {AUTO_MEMORY_IDLE_MINUTES}min bezczynności.")
    print("Zamknij to okno, żeby zatrzymać Debraina.")
    threading.Thread(target=background_maintenance_loop, daemon=True).start()
    if os.environ.get("DEBRAIN_NO_AUTOOPEN") != "1":
        threading.Timer(1.0, open_browser).start()
    app.run(host="127.0.0.1", port=PORT, debug=False)
