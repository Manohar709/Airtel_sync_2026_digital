"""Rasterise Lucide icons (presentation/build/assets/lucide/icons/*.svg) to transparent PNGs, cached."""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "assets" / "lucide" / "icons"
OUT = HERE / "out" / "icons"


def icon_path(name: str, color: str) -> Path:
    return OUT / f"{name}_{color.lstrip('#').upper()}.png"


def ensure_icons(specs, size=256):
    """specs: iterable of (name, hex color). Renders only the missing ones."""
    OUT.mkdir(parents=True, exist_ok=True)
    todo = [(n, c) for n, c in dict.fromkeys(specs) if not icon_path(n, c).exists()]
    if not todo:
        return
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge")
        page = b.new_page(viewport={"width": size + 20, "height": size + 20})
        for name, color in todo:
            f = SRC / f"{name}.svg"
            if not f.exists():
                raise SystemExit(f"Lucide icon not found: {name}")
            svg = re.sub(r"<!--.*?-->", "", f.read_text(encoding="utf-8"), flags=re.S)
            svg = (svg.replace('stroke="currentColor"', f'stroke="#{color.lstrip("#")}"')
                      .replace('width="24"', f'width="{size}"').replace('height="24"', f'height="{size}"'))
            page.set_content(f'<html><body style="margin:0;background:transparent">'
                             f'<div id="i" style="width:{size}px;height:{size}px">{svg}</div></body></html>')
            page.locator("#i").screenshot(path=str(icon_path(name, color)), omit_background=True)
        b.close()
