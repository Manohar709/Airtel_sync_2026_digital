"""Render the HLD (hld.js) to PNG and export an editable .excalidraw file.

Outputs (presentation/HLD/):
  hld_slide.png                 transparent background, for slide 4
  Airtel_Vyapaar_Connect_HLD.png   white background with title, standalone architecture diagram
  Airtel_Vyapaar_Connect_HLD.excalidraw   open at https://excalidraw.com (File > Open)

Run:  python presentation/build/hld/make_hld.py
"""
import base64
import json
import re
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
BUILD = HERE.parent
ASSETS = BUILD / "assets"
OUT = BUILD.parent / "HLD"
TMP = BUILD / "out"

ICON_NAMES = ["store", "headset", "shield-check", "sparkles", "calculator", "scan-line", "truck",
              "life-buoy", "scan-text", "database", "bot", "user-cog"]


def font_face(family, file, weight="400"):
    b64 = base64.b64encode((ASSETS / "fonts" / file).read_bytes()).decode()
    return (f"@font-face{{font-family:'{family}';src:url(data:font/woff2;base64,{b64}) format('woff2');"
            f"font-weight:{weight};font-style:normal;}}")


def build_html(standalone: bool) -> str:
    icons = {}
    for n in ICON_NAMES:
        svg = (ASSETS / "lucide" / "icons" / f"{n}.svg").read_text(encoding="utf-8")
        icons[n] = re.sub(r"<!--.*?-->", "", svg, flags=re.S).strip()
    css = font_face("Excalifont", "Excalifont-Regular.woff2") + font_face("Nunito", "Nunito-latin.woff2", "200 1000")
    return f"""<!doctype html><html><head><meta charset="utf-8">
<style>{css} html,body{{margin:0;padding:0;background:transparent}} svg{{display:block}}</style>
</head><body><svg id="s" xmlns="http://www.w3.org/2000/svg"></svg>
<script>{(ASSETS / 'rough.js').read_text(encoding='utf-8')}</script>
<script>const ICONS = {json.dumps(icons)}; const STANDALONE = {str(standalone).lower()};</script>
<script>{(HERE / 'hld.js').read_text(encoding='utf-8')}</script>
</body></html>"""


def render(page, html_path: Path, png: Path, transparent: bool):
    page.goto(html_path.as_uri())
    page.wait_for_function("window.__done === true", timeout=30000)
    err = page.evaluate("window.__error || null")
    if err:
        raise SystemExit("hld.js failed:\n" + err)
    page.locator("#s").screenshot(path=str(png), omit_background=transparent)
    return page.evaluate("window.__scene")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge")
        page = browser.new_page(viewport={"width": 1900, "height": 900}, device_scale_factor=2.5)
        page.on("console", lambda m: print("  [browser]", m.text) if m.type in ("warning", "error") else None)
        for standalone in (False, True):
            html = TMP / f"hld_{'standalone' if standalone else 'slide'}.html"
            html.write_text(build_html(standalone), encoding="utf-8")
            png = OUT / ("Airtel_Vyapaar_Connect_HLD.png" if standalone else "hld_slide.png")
            scene = render(page, html, png, transparent=not standalone)
            print(png)
            if standalone:
                ex = OUT / "Airtel_Vyapaar_Connect_HLD.excalidraw"
                ex.write_text(json.dumps(scene, ensure_ascii=False, indent=1), encoding="utf-8")
                print(ex, len(scene["elements"]), "elements")
        browser.close()


if __name__ == "__main__":
    main()
