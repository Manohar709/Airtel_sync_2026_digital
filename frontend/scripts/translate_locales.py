"""Draft-translate src/i18n/messages/en.json into the other 9 languages with Gemini.

Machine translations: native-speaker review is needed before real use (see DECISIONS.md).
Placeholders like {name} are validated; any string whose placeholders change keeps English.
Usage (repo root):  python frontend/scripts/translate_locales.py [lang ...] [--force]
"""
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
from app import ai  # noqa: E402  (uses GEMINI_API_KEY / GEMINI_MODEL from .env)

MSG = ROOT / "frontend" / "src" / "i18n" / "messages"
PH = re.compile(r"\{[a-zA-Z_]+\}")
KEEP_ENGLISH = {"brand.name", "verify.gstinLabel"}  # brand / identifiers stay as-is


def flatten(d, p=""):
    out = {}
    for k, v in d.items():
        key = f"{p}.{k}" if p else k
        out.update(flatten(v, key) if isinstance(v, dict) else {key: v})
    return out


def rebuild(en_tree, flat, p="", only_done=True):
    """Same shape as en.json; keys not translated yet are omitted so the parity check flags them."""
    out = {}
    for k, v in en_tree.items():
        key = f"{p}.{k}" if p else k
        if isinstance(v, dict):
            sub = rebuild(v, flat, key)
            if sub:
                out[k] = sub
        elif key in flat:
            out[k] = flat[key]
    return out


def save(path, en_tree, done):
    path.write_text(json.dumps(rebuild(en_tree, done), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def translate(lang, force=False):
    en_tree = json.loads((MSG / "en.json").read_text(encoding="utf-8"))
    en = flatten(en_tree)
    path = MSG / f"{lang}.json"
    old = flatten(json.loads(path.read_text(encoding="utf-8"))) if path.exists() and not force else {}
    todo = [k for k in en if k not in old and k not in KEEP_ENGLISH]
    done, kept = dict(old), []
    system = (f"You translate user-interface strings for an Indian small-business onboarding app into {ai.LANGS[lang]}. "
              "Use simple, natural, polite everyday language that a shop owner understands; common English tech words "
              "(GST, GSTIN, Udyam, PAN, Wi-Fi, CCTV, POS, SMS, WhatsApp, OTP, PNG, JPG, MB) may stay in English. "
              "Keep every {placeholder} exactly unchanged. Return a JSON object with the same keys.")
    for i in range(0, len(todo), 60):
        chunk = {k: en[k] for k in todo[i:i + 60]}
        out = None
        for attempt in range(6):
            try:
                out = json.loads(ai._call_llm(system, [{"role": "user", "text": json.dumps(chunk, ensure_ascii=False)}]))
                break
            except Exception as e:
                print(f"{lang}: retry {attempt + 1} after {type(e).__name__}", flush=True)
                time.sleep(10 * (attempt + 1))
        if out is None:
            print(f"{lang}: giving up on this chunk; it stays missing (re-run the script later)")
            continue
        for k, src in chunk.items():
            tr = out.get(k)
            if isinstance(tr, str) and tr.strip() and set(PH.findall(tr)) == set(PH.findall(src)):
                done[k] = tr
            else:
                done[k], _ = src, kept.append(k)
        print(f"{lang}: {min(i + 60, len(todo))}/{len(todo)}", flush=True)
        save(path, en_tree, done)  # keep progress if a later chunk fails
    for k in KEEP_ENGLISH:
        done[k] = en[k]
    save(path, en_tree, done)
    print(f"{lang}: written; kept English for {len(kept)} strings {kept[:5]}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    for lang in args or [l for l in ai.LANGS if l != "en"]:
        translate(lang, force="--force" in sys.argv)
