#!/usr/bin/env python3
"""
import_chat_exports.py — importuje eksporty ChatGPT i/albo Claude (pliki conversations.json)
do lokalnego skarbca Debraina (debrain_workspace/vault/), jako osobne notatki .md.

Działa ZAWSZE lokalnie, niezależnie od DEBRAIN_SYNC — żeby nie rozwalić limitu rozmiaru jsonbin
przy dużych archiwach. Jeśli chcesz mieć wybrane notatki też w webie, dopisz je ręcznie do skarbca
webowego (write_vault_note) po imporcie — tylko te, które faktycznie chcesz mieć pod ręką wszędzie.

Użycie:
    python import_chat_exports.py conversations.json
    python import_chat_exports.py sciezka/do/pliku1.json sciezka/do/pliku2.json ...

Rozpoznaje format automatycznie: ChatGPT (drzewo "mapping") albo Claude ("chat_messages").
Każda rozmowa trafia jako osobny plik .md w debrain_workspace/vault/import-czatow/<źródło>/.
"""

import sys
import os
import json
import re
import datetime

WORKSPACE = os.environ.get("DEBRAIN_WORKSPACE", "./debrain_workspace")
VAULT_DIR = os.path.join(WORKSPACE, "vault")


def slugify(text, max_len=60):
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE).strip().lower()
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:max_len] or "bez-tytulu"


def extract_chatgpt_conversation(conv):
    """ChatGPT: drzewo 'mapping' — trzeba przejść od current_node wstecz do korzenia."""
    mapping = conv.get("mapping", {})
    current_id = conv.get("current_node")
    messages = []

    if current_id and current_id in mapping:
        node_id = current_id
        chain = []
        while node_id:
            node = mapping.get(node_id)
            if not node:
                break
            chain.append(node)
            node_id = node.get("parent")
        chain.reverse()
    else:
        chain = list(mapping.values())

    for node in chain:
        msg = node.get("message")
        if not msg:
            continue
        author = (msg.get("author") or {}).get("role", "?")
        content = msg.get("content") or {}
        parts = content.get("parts") or []
        text = "\n".join(p for p in parts if isinstance(p, str)).strip()
        if text:
            messages.append((author, text))

    title = conv.get("title") or "Bez tytułu"
    ts = conv.get("create_time")
    date = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).strftime("%Y-%m-%d") if ts else "brak-daty"
    return title, date, messages


def extract_claude_conversation(conv):
    """Claude: 'chat_messages' — zwykle prosta, płaska lista."""
    messages = []
    for msg in conv.get("chat_messages", []):
        author = msg.get("sender") or msg.get("role") or "?"
        text = msg.get("text", "")
        if not text and isinstance(msg.get("content"), list):
            text = "\n".join(
                c.get("text", "") for c in msg["content"] if isinstance(c, dict) and c.get("type") == "text"
            )
        text = (text or "").strip()
        if text:
            messages.append((author, text))

    title = conv.get("name") or conv.get("title") or "Bez tytułu"
    created = conv.get("created_at", "")
    date = created[:10] if created else "brak-daty"
    return title, date, messages


def import_file(path):
    print(f"\nCzytam: {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        print("  Pominięto — nieoczekiwany format (spodziewana lista rozmów).")
        return 0

    if data and "mapping" in data[0]:
        source = "chatgpt"
        extractor = extract_chatgpt_conversation
    elif data and "chat_messages" in data[0]:
        source = "claude"
        extractor = extract_claude_conversation
    else:
        print("  Nie rozpoznano formatu (ani ChatGPT, ani Claude). Pomijam.")
        return 0

    target_dir = os.path.join(VAULT_DIR, "import-czatow", source)
    os.makedirs(target_dir, exist_ok=True)

    count = 0
    for conv in data:
        try:
            title, date, messages = extractor(conv)
        except Exception as e:
            print(f"  Błąd przy jednej rozmowie, pomijam: {e}")
            continue
        if not messages:
            continue

        fname = f"{date}-{slugify(title)}.md"
        fpath = os.path.join(target_dir, fname)

        body_lines = [f"# {title}", f"\n_Źródło: {source}, data: {date}_\n"]
        for author, text in messages:
            body_lines.append(f"**{author}:**\n\n{text}\n")

        with open(fpath, "w", encoding="utf-8") as f:
            f.write("\n".join(body_lines))
        count += 1

    print(f"  Zaimportowano {count} rozmów ({source}) do vault/import-czatow/{source}/")
    return count


def main():
    if len(sys.argv) < 2:
        print("Użycie: python import_chat_exports.py plik1.json [plik2.json ...]")
        sys.exit(1)

    os.makedirs(VAULT_DIR, exist_ok=True)
    total = 0
    for path in sys.argv[1:]:
        if not os.path.exists(path):
            print(f"Nie znaleziono: {path}")
            continue
        total += import_file(path)

    print(f"\nGotowe. Łącznie zaimportowano {total} rozmów do {VAULT_DIR}.")
    print("Te pliki są TYLKO lokalne — nie trafiły do wspólnego magazynu webowego (jsonbin ma za mały limit).")
    print("Jeśli chcesz wybrane notatki mieć też na webie, poproś Debraina o konkretną notatkę: "
          "'przenieś notatkę X do wspólnego skarbca'.")


if __name__ == "__main__":
    main()
