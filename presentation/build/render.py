"""Render a .pptx to PNG slides (and optionally PDF) with the installed Microsoft PowerPoint.

Usage:  python render.py deck.pptx out_dir [--pdf out.pdf] [--width 1920]

Opens the deck read-only and without a window; quits PowerPoint afterwards only if
it was not already running with other presentations open.
"""
import argparse
import os
import sys

import pythoncom
import win32com.client


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("deck")
    ap.add_argument("out_dir")
    ap.add_argument("--pdf")
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--slides", help="comma separated 1-based slide numbers (default: all)")
    a = ap.parse_args()

    deck = os.path.abspath(a.deck)
    out = os.path.abspath(a.out_dir)
    os.makedirs(out, exist_ok=True)

    pythoncom.CoInitialize()
    app = win32com.client.DispatchEx("PowerPoint.Application")
    already_open = app.Presentations.Count
    pres = app.Presentations.Open(deck, True, False, False)  # ReadOnly, Untitled, WithWindow
    try:
        w = a.width
        h = round(w * pres.PageSetup.SlideHeight / pres.PageSetup.SlideWidth)
        wanted = {int(s) for s in a.slides.split(",")} if a.slides else None
        for s in pres.Slides:
            if wanted and s.SlideIndex not in wanted:
                continue
            p = os.path.join(out, f"slide-{s.SlideIndex}.png")
            s.Export(p, "PNG", w, h)
            print(p)
        if a.pdf:
            pres.SaveAs(os.path.abspath(a.pdf), 32)  # ppSaveAsPDF
            print(os.path.abspath(a.pdf))
    finally:
        pres.Close()
        if already_open == 0 and app.Presentations.Count == 0:
            app.Quit()


if __name__ == "__main__":
    sys.exit(main())
