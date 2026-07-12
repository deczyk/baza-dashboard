#!/usr/bin/env python3
"""
Debrain — twój własny agent AI (mózg: DeepSeek V3.2), wersja terminalowa.
Logika (narzędzia, pętla agenta, pamięć) jest we wspólnym module agent_core.py —
ten sam moduł napędza też interfejs graficzny (gui_app.py / start_debrain.bat).

Setup:
    pip install -r requirements.txt
    Skopiuj .env.example do .env i wpisz tam swój DEEPSEEK_API_KEY (patrz README).

    python debrain.py

Użycie:
    python debrain.py                  -> tryb interaktywny (rozmowa, z pamięcią)
    python debrain.py "zadanie tutaj"  -> tryb jednorazowy (bez zapisu do pamięci)

W trybie interaktywnym:
    exit                 -> zakończ
    /reasoner             -> przełącz na deepseek-reasoner (mocniejszy, wolniejszy, droższy)
    /chat                 -> wróć do deepseek-chat (domyślny)
    /nowa                 -> zacznij nową rozmowę (nie kasuje pliku pamięci, tylko sesję)
"""

import sys
import agent_core as core


def main():
    if len(sys.argv) > 1:
        task = " ".join(sys.argv[1:])
        answer, _ = core.run_agent(task)
        print("\n" + answer)
        return

    today = core.today_str()
    model = core.DEFAULT_MODEL
    history, last_greeting_date = core.load_memory()
    remembered = len([m for m in history if m["role"] != "system"]) > 0

    print("Debrain do usług. (model:", model, "| workspace:", core.WORKSPACE, ")")
    if remembered:
        print("Pamiętam naszą poprzednią rozmowę.")
    print("Komendy: exit / /reasoner / /chat / /nowa\n")

    # Powitanie z cytatem i ciekawostką — raz dziennie, licząc od daty, nie od uruchomienia
    if last_greeting_date != today:
        answer, history = core.run_agent(core.GREETING_PROMPT, history=history, model=model, verbose=False)
        print(f"Debrain: {answer}\n")
        last_greeting_date = today
        core.save_memory(history, last_greeting_date)

    while True:
        try:
            user_input = input("Ty: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if user_input.lower() in ("exit", "quit", "q"):
            break
        if not user_input:
            continue
        if user_input == "/reasoner":
            model = "deepseek-reasoner"
            print("(przełączono na deepseek-reasoner — wolniejszy, ale mocniejszy w wieloetapowym rozumowaniu)\n")
            continue
        if user_input == "/chat":
            model = "deepseek-chat"
            print("(przełączono z powrotem na deepseek-chat)\n")
            continue
        if user_input == "/nowa":
            history = [{"role": "system", "content": core.SYSTEM_PROMPT}]
            print("(zaczynamy od nowa w tej sesji — plik pamięci nadpiszę po następnej wiadomości)\n")
            continue

        answer, history = core.run_agent(user_input, history=history, model=model)
        print(f"\nDebrain: {answer}\n")
        core.save_memory(history, last_greeting_date)


if __name__ == "__main__":
    main()
