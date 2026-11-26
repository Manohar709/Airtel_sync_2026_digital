"""Build the Airtel Vyapaar Connect deck on the Airtel SYNC template.

Run from the project root:
    python presentation/build/hld/make_hld.py     # only when the HLD changes
    python presentation/build/build_deck.py

Screenshots for slide 3: put them in Hackthon_Project/screenshots/ named
1_advisor, 2_plan, 3_kyc, 4_help, 5_orders, 6_queue (.png / .jpg) and re-run.
Missing ones show a neat placeholder frame instead.
"""
import os
from pathlib import Path

from lxml import etree
from PIL import Image, ImageFont
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

from icons import ensure_icons, icon_path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "6ae1873397bc1_digital" / "template.pptx"
OUT = Path(os.environ.get("DECK_OUT", ROOT / "presentation" / "Airtel_Vyapaar_Connect_The_Boys.pptx"))
HLD_PNG = ROOT / "presentation" / "HLD" / "hld_slide.png"
SHOTS = Path(os.environ.get("SHOTS_DIR", ROOT / "screenshots"))
# Which part of each screenshot to keep when cropping to the card frame:
# (horizontal 0..1, vertical 0..1) — 0 = left/top edge, 0.5 = centre, 1 = right/bottom edge.
SHOT_FOCUS = {
    "1_advisor": (0.5, 0.35), "2_plan": (0.5, 0.35), "3_kyc": (0.5, 0.35),
    "4_help": (0.5, 0.4), "5_orders": (0.5, 0.3), "6_queue": (0.5, 0.3),
}

RED, RED_DARK, INK, GREY, MUTE, LINE = "E30000", "B00000", "1A1A1A", "555555", "8C8C8C", "E4E4E4"
TINT, TINT_LINE, SOFT = "FDEEEE", "F4B4B4", "F6F7F9"
GREEN, GREEN_T, GREEN_L = "2F9E44", "EBFBEE", "B2F2BB"
AMBER, AMBER_T = "D9480F", "FFF4E6"
HOLD, HOLD_T = "E03131", "FFE3E3"
INDIGO = "3B5BDB"
WHITE = "FFFFFF"

WARN = []

# ------------------------------------------------------------------ text measuring (Arial)
_F = {}


def _font(bold):
    if bold not in _F:
        _F[bold] = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf", 1000)
    return _F[bold]


def width_in(s, size, bold=False):
    return _font(bool(bold)).getlength(s) * size / 1000 / 72


def n_lines(s, size, bold, width):
    total = 0
    for para in s.split("\n"):
        cur, n = "", 1
        for w in para.split(" "):
            t = f"{cur} {w}".strip()
            if not cur or width_in(t, size, bold) <= width:
                cur = t
            else:
                n, cur = n + 1, w
        total += n
    return total


# ------------------------------------------------------------------ shape helpers
rgb = RGBColor.from_string
ALIGN = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}
ANCH = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}


def shadow(shp, blur=9, dist=2.5, alpha=14):
    spPr = shp._element.spPr
    eff = spPr.find(qn("a:effectLst"))
    if eff is None:
        eff = etree.SubElement(spPr, qn("a:effectLst"))
    sh = etree.SubElement(eff, qn("a:outerShdw"), blurRad=str(int(Pt(blur))), dist=str(int(Pt(dist))),
                          dir="5400000", algn="t", rotWithShape="0")
    c = etree.SubElement(sh, qn("a:srgbClr"), val="000000")
    etree.SubElement(c, qn("a:alpha"), val=str(alpha * 1000))


def shape(slide, kind, x, y, w, h, fill=None, line=None, lw=0.75, radius=None, shd=False, name=None):
    shp = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    if kind == MSO_SHAPE.ROUNDED_RECTANGLE:
        shp.adjustments[0] = min(0.5, (radius if radius is not None else 0.1) / min(w, h))
    if fill:
        shp.fill.solid()
        shp.fill.fore_color.rgb = rgb(fill)
    else:
        shp.fill.background()
    if line:
        shp.line.color.rgb = rgb(line)
        shp.line.width = Pt(lw)
    else:
        shp.line.fill.background()
    if shd:
        shadow(shp)
    else:   # override the theme effect python-pptx's default shape style would apply (a drop shadow)
        spPr = shp._element.spPr
        if spPr.find(qn("a:effectLst")) is None:
            etree.SubElement(spPr, qn("a:effectLst"))
    if name:
        shp.name = name
    return shp


def card(slide, x, y, w, h, fill=WHITE, line=LINE, radius=0.1, shd=True, name=None, lw=0.75):
    return shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, fill, line, lw, radius, shd, name)


def text(slide, x, y, w, h, content, size=11, bold=False, color=INK, align="l", anchor="t", spc=None,
         line=1.0, after=0, name=None, check=True, wrap=True, italic=False):
    """content: str | list of paragraphs; paragraph: str | list of runs | {'runs':..., 'size':.., ...};
    run: str | (str, {size, bold, color, italic, spc})."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        tb.name = name
    tf = tb.text_frame
    tf.word_wrap = wrap
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = ANCH[anchor]
    paras = content if isinstance(content, list) else [content]
    need = 0.0
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        po = p if isinstance(p, dict) else {"runs": p}
        runs = po["runs"]
        runs = [runs] if isinstance(runs, (str, tuple)) else runs
        para.alignment = ALIGN[po.get("align", align)]
        para.line_spacing = po.get("line", line)
        sa = po.get("after", after)
        if sa:
            para.space_after = Pt(sa)
        p_size, p_bold, p_text = 0, False, ""
        for r in runs:
            t, o = (r, {}) if isinstance(r, str) else r
            run = para.add_run()
            run.text = t
            f = run.font
            f.name = "Arial"
            sz = o.get("size", po.get("size", size))
            bd = o.get("bold", po.get("bold", bold))
            f.size, f.bold = Pt(sz), bd
            f.italic = o.get("italic", po.get("italic", italic))
            f.color.rgb = rgb(o.get("color", po.get("color", color)))
            s = o.get("spc", po.get("spc", spc))
            if s:
                run._r.get_or_add_rPr().set("spc", str(int(s * 100)))
            p_size, p_bold, p_text = max(p_size, sz), p_bold or bd, p_text + t
        if p_text:
            if wrap:
                nl = n_lines(p_text, p_size, p_bold, w)
            else:
                nl = 1
                if width_in(p_text, p_size, p_bold) > w + 0.01:
                    WARN.append(f"too wide ({width_in(p_text, p_size, p_bold):.2f}>{w:.2f}in): {p_text[:60]}")
            need += nl * p_size * 1.17 / 72 * po.get("line", line) + po.get("after", after) / 72
    if check and need > h + 0.03:
        WARN.append(f"overflow ({need:.2f}>{h:.2f}in): {str(paras)[:90]}")
    return tb


def picture(slide, path, x, y, w=None, h=None, crop=None, radius=None, name=None, descr=None):
    p = slide.shapes.add_picture(str(path), Inches(x), Inches(y),
                                 Inches(w) if w else None, Inches(h) if h else None)
    if crop:
        p.crop_left, p.crop_top, p.crop_right, p.crop_bottom = crop
    if radius:
        geom = p._element.spPr.find(qn("a:prstGeom"))
        geom.set("prst", "roundRect")
        av = geom.find(qn("a:avLst"))
        if av is None:
            av = etree.SubElement(geom, qn("a:avLst"))
        pw, ph = p.width / 914400, p.height / 914400
        etree.SubElement(av, qn("a:gd"), name="adj", fmla=f"val {int(min(50000, radius / min(pw, ph) * 100000))}")
    if name:
        p.name = name
    p._element.nvPicPr.cNvPr.set("descr", descr or "")
    return p


def icon(slide, name, color, x, y, s):
    return picture(slide, icon_path(name, color), x, y, s, s, name=f"icon {name}", descr="")


def icon_dot(slide, name, x, y, d, bg=RED, fg=WHITE, k=0.54):
    shape(slide, MSO_SHAPE.OVAL, x, y, d, d, fill=bg, name=f"dot {name}")
    s = d * k
    icon(slide, name, fg, x + (d - s) / 2, y + (d - s) / 2, s)


def num_dot(slide, label, x, y, d, bg=RED, fg=WHITE, size=11):
    o = shape(slide, MSO_SHAPE.OVAL, x, y, d, d, fill=bg, name=f"number {label}")
    tf = o.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    para = tf.paragraphs[0]
    para.alignment = PP_ALIGN.CENTER
    r = para.add_run()
    r.text = label
    r.font.name, r.font.size, r.font.bold, r.font.color.rgb = "Arial", Pt(size), True, rgb(fg)
    return o


def chip(slide, x, y, label, fg, bg, line=None, size=8.5, h=0.24, pad=0.09, ic=None, bold=True, name=None, ic_color=None):
    """Pill with optional leading icon; returns right edge x."""
    tw = width_in(label, size, bold)
    isz = h * 0.56 if ic else 0
    w = pad * 2 + tw + (isz + 0.05 if ic else 0)
    shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, fill=bg, line=line, radius=h / 2, name=name or f"chip {label}")
    tx = x + pad
    if ic:
        icon(slide, ic, ic_color or fg, tx, y + (h - isz) / 2, isz)
        tx += isz + 0.05
    text(slide, tx, y, tw + 0.05, h, label, size=size, bold=bold, color=fg, anchor="m", wrap=False, check=False)
    return x + w


def header(slide, label, title, subtitle=None):
    text(slide, 0.486, 0.655, 8.6, 0.19, label, size=9, bold=True, color=RED, spc=0.8, wrap=False, name="Section label")
    t = slide.shapes.title
    t.left, t.top, t.width, t.height = Inches(0.486), Inches(0.86), Inches(9.05), Inches(0.36)
    tf = t.text_frame
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.TOP
    tf.text = title
    r = tf.paragraphs[0].runs[0]
    r.font.name, r.font.size, r.font.bold, r.font.color.rgb = "Arial", Pt(20), True, rgb(INK)
    if width_in(title, 20, True) > 9.05:
        WARN.append(f"title too wide ({width_in(title, 20, True):.2f}in): {title}")
    if subtitle:
        text(slide, 0.486, 1.22, 9.05, 0.22, subtitle, size=11, color=GREY, wrap=False, name="Subtitle")


def banner(slide, y, runs, ic="headset", h=0.3):
    card(slide, 0.49, y, 9.02, h, fill="FFF4F4", line=TINT_LINE, radius=0.08, shd=False, name="Banner")
    s = 0.19
    icon(slide, ic, RED, 0.64, y + (h - s) / 2, s)
    text(slide, 0.93, y, 8.45, h, [runs], size=10, anchor="m", name="Banner text")


def notes(slide, s):
    slide.notes_slide.notes_text_frame.text = s


def fix_content_types(path: Path):
    """The template declares JPEGs as the non-standard 'image/jpg'; declare them as image/jpeg instead."""
    import re
    import zipfile

    tmp = path.with_name(path.stem + ".tmp.pptx")
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "[Content_Types].xml":
                ct = data.decode("utf-8")
                ct = re.sub(r'<Override PartName="[^"]+\.jpe?g" ContentType="image/jpe?g"/>', "", ct)
                ct = re.sub(r'<Default Extension="jpe?g" ContentType="[^"]+"/>', "", ct)
                ct = ct.replace("<Default ", '<Default Extension="jpg" ContentType="image/jpeg"/><Default ', 1)
                data = ct.encode("utf-8")
            zout.writestr(item, data)
    os.replace(tmp, path)


# ------------------------------------------------------------------ build
def main():
    ensure_icons([
        ("messages-square", WHITE), ("receipt-indian-rupee", WHITE), ("scan-line", WHITE), ("truck", WHITE),
        ("arrow-right", RED), ("target", WHITE), ("headset", RED), ("check", GREEN),
        ("messages-square", MUTE), ("receipt-indian-rupee", MUTE), ("scan-line", MUTE), ("headset", MUTE),
        ("package-check", MUTE), ("layout-dashboard", MUTE), ("image-plus", MUTE),
        ("square-check-big", WHITE), ("smartphone", WHITE), ("scan-text", WHITE), ("list-checks", WHITE),
        ("badge-check", WHITE), ("chevron-right", MUTE), ("lock", INK), ("sparkles", RED),
        ("crosshair", WHITE), ("minimize-2", WHITE), ("fingerprint", WHITE), ("trending-up", WHITE),
        ("shield-check", RED), ("play", WHITE), ("arrow-right", WHITE), ("circle-check-big", GREEN),
    ])

    prs = Presentation(str(TEMPLATE))
    ids = prs.slides._sldIdLst
    for sid in list(ids)[1:]:                 # keep the cover, drop the old content slides
        prs.part.drop_rel(sid.rId)
        ids.remove(sid)
    layout = next(l for l in prs.slide_layouts if l.name == "Title Only")
    new = lambda: prs.slides.add_slide(layout)  # noqa: E731

    # ============================================================ 1. COVER
    s = prs.slides[0]
    text(s, 0.62, 2.84, 4.2, 0.2, "AIRTEL VYAPAAR CONNECT", size=10, bold=True, color="FF5C5C", spc=1.6, wrap=False, name="Product")
    text(s, 0.62, 3.08, 3.6, 1.14, ["Your business,", "connected in", "one sitting"], size=24, bold=True, color=WHITE,
         line=0.92, name="Tagline")
    text(s, 0.62, 4.33, 3.6, 0.4, "AI advisor · instant quote · smart KYC · live order tracking, on a phone, in Hindi, English or Telugu",
         size=10.5, color="D6D6D6", name="Summary")
    text(s, 0.62, 4.88, 4.0, 0.22, [[("Team The Boys", {"bold": True, "color": WHITE}),
                                     ("  ·  NIT Kurukshetra", {"color": "D6D6D6"})]], size=11, wrap=False, name="Team")
    notes(s, "Hi, we're Team The Boys from NIT Kurukshetra. This is Airtel Vyapaar Connect: a small business owner "
             "discovers the right bundle, sees one clear price, verifies the business and tracks installation, all on a "
             "phone, in their language, in one sitting. Everything you will see is a working prototype built on the case dataset.")

    # ============================================================ 2. PROBLEM → WHAT WE BUILT
    s = new()
    header(s, "THE PROBLEM  ·  AND WHAT WE BUILT FOR IT",
           "Owners want to buy. Buying makes them quit",
           "5,000 SMB leads → only 368 went live (7.4%). We traced every drop reason in smb_leads.csv and built a fix for each.")
    text(s, 0.49, 1.56, 2.9, 0.18, "WHY OWNERS LEFT", size=8.5, bold=True, color=MUTE, spc=0.8, wrap=False)
    text(s, 4.03, 1.56, 3.4, 0.18, "WHAT WE BUILT", size=8.5, bold=True, color=MUTE, spc=0.8, wrap=False)
    rows = [
        ("1,951", "never got a conversation", "unreachable · wrong number · no time for a visit",
         "messages-square", "AI Advisor on their phone, any time",
         "Chat or speak in Hindi, English or Telugu. No visit needed; mobile verified by OTP."),
        ("385", "quote too slow or confusing", "3–5 day PDFs full of product codes",
         "receipt-indian-rupee", "One plan, one price, instantly",
         "Eligible bundle from 25 products; toggle add-ons and the monthly price updates live."),
        ("273", "lost to paperwork", "missing GST / Udyam · long forms · mismatches",
         "scan-line", "Smart KYC in minutes",
         "Snap photos; local OCR + registry checks give PASS, ASK or HOLD. Works without GST."),
        ("151", "said yes, then waited", "install delayed past 21 days, or cancelled",
         "truck", "Live order tracker + staff queue",
         "Owners see every step and ETA; staff see 21-day SLA risk before it is late."),
    ]
    y0, rh, gap = 1.8, 0.66, 0.1
    for i, (num, lab, det, ic, title, body) in enumerate(rows):
        y = y0 + i * (rh + gap)
        card(s, 0.49, y, 3.2, rh, fill=TINT, line=None, shd=False, name=f"Problem {i + 1}")
        text(s, 0.61, y, 0.86, rh, num, size=21, bold=True, color=RED, anchor="m", wrap=False)
        text(s, 1.5, y, 2.1, rh, [{"runs": lab, "size": 10, "bold": True, "after": 1.5},
                                   {"runs": det, "size": 8.5, "color": GREY}], anchor="m")
        icon(s, "arrow-right", RED, 3.74, y + rh / 2 - 0.12, 0.24)
        card(s, 4.03, y, 3.52, rh, name=f"Fix {i + 1}")
        icon_dot(s, ic, 4.15, y + (rh - 0.42) / 2, 0.42)
        text(s, 4.69, y, 2.78, rh, [{"runs": title, "size": 11, "bold": True, "after": 1.5},
                                     {"runs": body, "size": 9, "color": GREY}], anchor="m")
    # so-what panel
    card(s, 7.72, 1.8, 1.79, 2.94, fill=RED, line=None, radius=0.12, name="So what")
    icon(s, "target", WHITE, 8.405, 2.08, 0.42)
    text(s, 7.72, 2.56, 1.79, 0.62, "60%", size=40, bold=True, color=WHITE, align="c", anchor="m", wrap=False)
    text(s, 7.86, 3.22, 1.51, 0.66, "of lost leads quit for a reason this build targets", size=11, bold=True, color=WHITE, align="c")
    text(s, 7.86, 4.12, 1.51, 0.42, "2,760 of 4,632 drop-offs in smb_leads.csv", size=8.5, color="FFD9D9", align="c")
    banner(s, 4.86, [("A human is always one tap away:  ", {"bold": True}),
                     ("“Talk to a person” on every page sends the request straight to the staff queue.", {})])
    notes(s, "We started from the data. Of 5,000 leads, only 368 went live. We read every drop reason in smb_leads.csv. "
             "1,951 never got a real conversation: unreachable, wrong numbers, no time for a visit. 385 dropped at the quote "
             "because it was slow or confusing. 273 were lost to paperwork, and 151 said yes and then waited too long for "
             "installation. Each has a matching feature we built, and together they target the reasons behind 60% of all "
             "drop-offs. And whenever the owner is stuck, a person is one tap away.")

    # ============================================================ 3. KILLER FEATURES
    s = new()
    header(s, "THE PRODUCT  ·  WHAT WE BUILT", "One phone, one sitting: discover, buy, verify, track")
    x = text(s, 0.49, 1.22, 0.8, 0.24, "Case brief:", size=9, bold=True, color=GREY, anchor="m", wrap=False)
    cx_ = 0.49 + width_in("Case brief:", 9, True) + 0.1
    for lab in ["Advisor", "Quote & checkout", "Smart KYC", "Tracker"]:
        cx_ = chip(s, cx_, 1.22, lab, GREEN, GREEN_T, GREEN_L, ic="check") + 0.06
    cx_ += 0.14
    text(s, cx_, 1.22, 0.9, 0.24, "Stretch goals:", size=9, bold=True, color=GREY, anchor="m", wrap=False)
    cx_ += width_in("Stretch goals:", 9, True) + 0.1
    for lab in ["Voice front end", "Back-office console"]:
        cx_ = chip(s, cx_, 1.22, lab, GREEN, GREEN_T, GREEN_L, ic="check") + 0.06
    feats = [
        ("1_advisor", "messages-square", "AI Advisor", "no visit, no rep needed", "Chat or voice in Hindi, English or Telugu", "CUSTOMER"),
        ("2_plan", "receipt-indian-rupee", "One Plan, One Price", "3–5 day confusing quotes", "Price updates live as add-ons toggle", "CUSTOMER"),
        ("3_kyc", "scan-line", "Smart KYC", "paper KYC and mismatches", "OCR + registry → PASS · ASK · HOLD", "CUSTOMER"),
        ("4_help", "headset", "Talk to a Person", "“no one to ask”", "Every page; lands in the staff queue live", "CUSTOMER"),
        ("5_orders", "package-check", "My Orders Tracker", "~3 status-chase calls", "Live steps, ETAs, OTP e-sign + AutoPay", "CUSTOMER"),
        ("6_queue", "layout-dashboard", "Employee Console", "lost leads, late installs", "Urgency queue, SLA risk, one-tap call", "STAFF"),
    ]
    cw, ch = 2.9, 1.74
    for i, (stem, ic, title, solves, how, who) in enumerate(feats):
        x = 0.49 + (i % 3) * (cw + 0.16)
        y = 1.56 + (i // 3) * (ch + 0.08)
        card(s, x, y, cw, ch, name=f"Feature {title}")
        fx, fy, fw, fh = x + 0.09, y + 0.09, cw - 0.18, 0.98
        shot = next((p for p in (SHOTS / f"{stem}{e}" for e in (".png", ".jpg", ".jpeg")) if p.exists()), None)
        if shot:
            iw, ih = Image.open(shot).size
            ia, fa = iw / ih, fw / fh
            fxp, fyp = SHOT_FOCUS.get(stem, (0.5, 0.35))
            if ia > fa:                      # wider than the frame: trim the sides
                extra = 1 - fa / ia
                crop = (extra * fxp, 0, extra * (1 - fxp), 0)
            else:                            # taller than the frame: trim top / bottom
                extra = 1 - ia / fa
                crop = (0, extra * fyp, 0, extra * (1 - fyp))
            picture(s, shot, fx, fy, fw, fh, crop=crop, radius=0.07, name=f"Screenshot {title}",
                    descr=f"Screenshot of the {title} screen")
            shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, fx, fy, fw, fh, line=LINE, radius=0.07, name="frame")
        else:
            card(s, fx, fy, fw, fh, fill="F2F3F5", line=None, radius=0.07, shd=False, name=f"Screenshot slot {stem}")
            icon(s, ic, MUTE, fx + fw / 2 - 0.17, fy + 0.2, 0.34)
            text(s, fx, fy + 0.62, fw, 0.18, f"add screenshots/{stem}.png", size=8, color=MUTE, align="c", wrap=False)
        tag_w = width_in(who, 6.5, True) + 0.14
        chip(s, x + cw - 0.13 - tag_w, y + 1.155, who, WHITE, RED if who == "CUSTOMER" else INDIGO, size=6.5, h=0.18, pad=0.07)
        text(s, x + 0.13, y + 1.13, cw - 0.36 - tag_w, 0.22, title, size=12, bold=True, wrap=False)
        text(s, x + 0.13, y + 1.36, cw - 0.26, 0.17, [[("Solves: ", {"bold": True}), (solves, {})]], size=9, color=RED, wrap=False)
        text(s, x + 0.13, y + 1.53, cw - 0.26, 0.17, how, size=9, color=GREY, wrap=False)
    notes(s, "Here is the product. It covers all four modules in the brief, advisor, quote and checkout, smart KYC and "
             "tracker, plus two stretch goals: a voice front end and a back-office console. Each card shows the problem it "
             "removes. The advisor replaces the sales visit; one plan with a live price replaces the slow PDF quote; smart KYC "
             "replaces paper; 'Talk to a person' keeps a human one tap away; My Orders replaces status-chase calls; and the "
             "employee console makes sure no lead or installation is forgotten.")

    # ============================================================ 4. HLD
    s = new()
    header(s, "SOLUTION ARCHITECTURE  ·  HIGH-LEVEL DESIGN", "Every step the owner sees, and the engine behind it")
    iw, ih = Image.open(HLD_PNG).size
    bh = 3.9
    bw = bh * iw / ih
    if bw > 9.4:
        bw, bh = 9.4, 9.4 * ih / iw
    picture(s, HLD_PNG, (10 - bw) / 2, 1.24, bw, bh, name="HLD diagram",
            descr="High-level design: customer portal journey (chat, plan and price, verify, sign-pay-track, talk to a person) "
                  "through a privacy shield into a FastAPI backend with AI Advisor, Rules and Quote, Smart KYC, Order Lifecycle "
                  "and Help and Handoff modules, PostgreSQL, local PaddleOCR, simulated rails, Gemini outside the server, and "
                  "the staff console (urgency queue, case view, act).")
    notes(s, "This is the architecture. The top lane is what the owner does, in four steps, plus 'Talk to a person'. Every "
             "request passes our privacy shield. In the middle is the FastAPI backend: each journey step has its own module in "
             "the same column. The key principle: AI understands, the backend decides. Gemini only helps with conversation and "
             "explanation, sits outside our server and only ever receives redacted text. Prices, eligibility, KYC verdicts and "
             "order status are decided by deterministic code on PostgreSQL. KYC reads documents with OCR on our own server; "
             "clean applications pass automatically, fixable ones go back to the owner, and only real exceptions go on hold "
             "to a person. The bottom lane is the staff console: an urgency-ranked queue, a case view and one-tap actions, "
             "whose decisions flow back into the order and the customer's tracker. Dashed boxes are simulated today and "
             "become real integrations in Phase 2.")

    # ============================================================ 5. SMART KYC + PRIVACY
    s = new()
    header(s, "SMART KYC  ·  PRIVACY & SECURITY BY DESIGN", "Verified in minutes, and the AI never sees a document",
           "Built around the DPDP Act's three asks: consent, purpose limitation and data minimisation.")
    card(s, 0.49, 1.56, 4.62, 3.16, name="KYC panel")
    text(s, 0.66, 1.68, 4.2, 0.18, "SMART KYC PIPELINE", size=8.5, bold=True, color=MUTE, spc=0.8, wrap=False)
    steps = [("square-check-big", "Consent", ["asked first,", "time-stamped"]),
             ("smartphone", "Mobile OTP", ["hashed, 10 min,", "5 tries"]),
             ("scan-text", "Read", ["OCR on our", "server, de-skew"]),
             ("list-checks", "Check", ["GSTIN, registry,", "name, bill date"]),
             ("badge-check", "Verdict", ["PASS, ASK", "or HOLD"])]
    nw = (4.62 - 0.3) / 5
    for i, (ic, name, cap) in enumerate(steps):
        nx = 0.64 + i * nw
        icon_dot(s, ic, nx + nw / 2 - 0.22, 1.95, 0.44)
        if i < 4:
            icon(s, "chevron-right", MUTE, nx + nw - 0.08, 2.09, 0.16)
        text(s, nx, 2.45, nw, 0.18, name, size=9.5, bold=True, align="c", wrap=False)
        text(s, nx + 0.03, 2.63, nw - 0.06, 0.3, cap, size=8, color=GREY, align="c")
    shape(s, MSO_SHAPE.RECTANGLE, 0.66, 3.03, 4.28, 0.012, fill=LINE, name="divider")
    text(s, 0.66, 3.11, 4.3, 0.2, [[("Tested on all 12 specimen applicants (47 documents):  ", {"bold": True}),
                                    ("12 / 12 correct", {"bold": True, "color": GREEN})]], size=9, wrap=False)
    verdicts = ["HOLD", "PASS", "PASS", "ASK", "ASK", "HOLD", "HOLD", "PASS", "PASS", "PASS", "ASK", "PASS"]
    style = {"PASS": (GREEN, GREEN_T), "ASK": (AMBER, AMBER_T), "HOLD": (HOLD, HOLD_T)}
    for i, v in enumerate(verdicts):
        fg, bg = style[v]
        x, y = 0.66 + (i % 6) * 0.722, 3.38 + (i // 6) * 0.34
        card(s, x, y, 0.66, 0.27, fill=bg, line=fg, radius=0.06, shd=False, name=f"K{i + 1:02d} {v}")
        text(s, x, y, 0.66, 0.27, [[(f"K{i + 1:02d} ", {"color": INK}), (v, {"color": fg})]],
             size=8, bold=True, align="c", anchor="m", wrap=False)
    text(s, 0.66, 4.12, 4.3, 0.52, [
        [("HOLD → a person:  ", {"bold": True, "color": HOLD}), ("K01 cancelled GSTIN · K06 altered GSTIN · K07 edited name", {})],
        [("ASK → owner fixes:  ", {"bold": True, "color": AMBER}), ("K04 blurred photo · K05 Udyam missing · K11 old bill", {})],
        [("PASS → auto-approved:  ", {"bold": True, "color": GREEN}), ("K02 tilted scan, K08 / K10 look-alikes fixed", {})],
    ], size=8, color=GREY, line=1.05)
    principles = [
        ("square-check-big", "Consent", "Asked before any document or ID, in the owner's language, and time-stamped. "
                                        "Withdraw any time and the checks stop."),
        ("crosshair", "Purpose limitation", "Used only for onboarding. The AI sees redacted chat text only; staff see "
                                            "masked IDs like 27••••••••••1ZP."),
        ("minimize-2", "Data minimisation", "GST certificate only for GST products, no-GST path, only the last 4 Aadhaar "
                                            "digits, documents auto-deleted after 7 days."),
    ]
    for i, (ic, t, b) in enumerate(principles):
        y = 1.56 + i * 0.85
        card(s, 5.29, y, 4.22, 0.77, name=f"Principle {t}")
        icon_dot(s, ic, 5.42, y + (0.77 - 0.42) / 2, 0.42)
        text(s, 5.97, y, 3.42, 0.77, [{"runs": t, "size": 11, "bold": True, "after": 1.5},
                                       {"runs": b, "size": 8.5, "color": GREY}], anchor="m")
    card(s, 5.29, 4.11, 4.22, 0.61, fill=SOFT, line=LINE, shd=False, name="Security")
    icon(s, "lock", INK, 5.44, 4.11 + 0.61 / 2 - 0.1, 0.2)
    text(s, 5.75, 4.11, 3.66, 0.61, [[("Also built in:  ", {"bold": True, "color": INK}),
                                       ("JWT + bcrypt · ownership check on every request · rate limits · OTPs stored "
                                        "hashed · secrets only in server config", {})]], size=8.5, color=GREY, anchor="m")
    banner(s, 4.84, [("AI understands. Backend decides.  ", {"bold": True, "color": RED}),
                     ("Eligibility, prices, KYC verdicts and order status come from code, never from the AI.", {})],
           ic="sparkles", h=0.29)
    notes(s, "KYC is where trust is won or lost. Five steps: consent first, mobile OTP, OCR on our own server that "
             "straightens tilted scans and removes watermarks, rule checks against the registries, and one clear verdict. "
             "We tested it on all 12 specimen applicants and their 47 documents in the case pack: all 12 verdicts are correct, "
             "including every planted problem. On privacy we followed the DPDP Act's three asks: consent before anything is "
             "collected, purpose limitation through redaction and masking, and data minimisation with a no-GST path, only "
             "the last 4 Aadhaar digits, and automatic deletion of documents after 7 days.")

    # ============================================================ 6. PHASE 2
    s = new()
    header(s, "WHAT'S NEXT  ·  PHASE 2", "Phase 2: swap simulations for real rails, then scale",
           "Every dashed box in our architecture becomes a live integration; the engine and its rules stay the same.")
    cols = [
        ("fingerprint", "Verify for real", "mock data → live government rails", [
            ("Live GSTN + Udyam APIs", "real-time status via a GST Suvidha Provider"),
            ("Aadhaar e-KYC", "UIDAI / DigiLocker replaces our simulation"),
            ("Face match + liveness", "selfie vs ID photo stops impersonation"),
            ("Aadhaar eSign + UPI AutoPay", "licensed eSign provider, NPCI e-mandate")]),
        ("messages-square", "Reach every owner", "same engine, more channels", [
            ("WhatsApp advisor", "the same flow on the WhatsApp Business API"),
            ("22 languages + voice", "Bhashini speech and translation (3 today)"),
            ("Partner Mitra mode", "field reps and retailers run the same flow"),
            ("Real SMS alerts", "DLT-registered gateway for OTPs and status")]),
        ("trending-up", "Grow smarter", "data the journey already captures", [
            ("Fibre feasibility check", "GIS lookup; offer 5G AirFiber if fibre is late"),
            ("Propensity score", "call the drop-offs most likely to convert"),
            ("Drop-off nudges", "one-tap WhatsApp link to resume a journey"),
            ("Live technician tracking", "map and ETA, fewer chase calls")]),
    ]
    for i, (ic, title, sub, items) in enumerate(cols):
        x = 0.49 + i * 3.06
        card(s, x, 1.56, 2.9, 3.0, name=f"Phase 2 {title}")
        icon_dot(s, ic, x + 0.16, 1.72, 0.46)
        text(s, x + 0.74, 1.71, 2.06, 0.24, title, size=13, bold=True, wrap=False)
        text(s, x + 0.74, 1.95, 2.06, 0.2, sub, size=8.5, color=GREY, wrap=False)
        shape(s, MSO_SHAPE.RECTANGLE, x + 0.16, 2.33, 2.58, 0.012, fill=LINE, name="divider")
        for k, (name, det) in enumerate(items):
            y = 2.45 + k * 0.52
            icon(s, "arrow-right", RED, x + 0.17, y + 0.02, 0.15)
            text(s, x + 0.4, y, 2.4, 0.19, name, size=10, bold=True, wrap=False)
            text(s, x + 0.4, y + 0.2, 2.4, 0.18, det, size=8.5, color=GREY, wrap=False)
    card(s, 0.49, 4.68, 9.02, 0.42, fill=SOFT, line=LINE, shd=False, name="Hardening")
    text(s, 0.64, 4.68, 1.7, 0.42, "BEFORE SCALE", size=8.5, bold=True, color=MUTE, spc=0.8, anchor="m", wrap=False)
    hx = 1.95
    for lab in ["Encryption at rest", "Consent ledger + audit log", "India-hosted AI model", "DPO + breach response (DPDP Rules)"]:
        hx = chip(s, hx, 4.77, lab, INK, WHITE, LINE, size=8.5, h=0.24, ic="shield-check", bold=False, ic_color=RED) + 0.1
    notes(s, "Phase 2 replaces our simulations with real rails: live GSTN and Udyam APIs, Aadhaar e-KYC with face match "
             "and liveness, real eSign and UPI AutoPay. Then we reach more owners, through WhatsApp, 22 languages via "
             "Bhashini and an assisted mode for field reps and partners, and grow smarter with fibre feasibility, propensity "
             "scoring and drop-off nudges. Before we scale, we harden production: encryption at rest, a consent ledger, an "
             "India-hosted model and a DPO process under the DPDP Rules.")

    # ============================================================ 7. DEMO VIDEO
    s = new()
    header(s, "LIVE DEMO", "See it working: the 3-minute demo")
    vx, vy, vw = 0.49, 1.45, 6.2
    vh = vw * 9 / 16
    card(s, vx, vy, vw, vh, fill="141414", line=None, radius=0.1, name="VIDEO PLACEHOLDER (replace with your video)")
    shape(s, MSO_SHAPE.OVAL, vx + vw / 2 - 0.42, vy + vh / 2 - 0.62, 0.84, 0.84, fill=RED, name="play button")
    icon(s, "play", WHITE, vx + vw / 2 - 0.17, vy + vh / 2 - 0.37, 0.34)
    text(s, vx, vy + vh / 2 + 0.34, vw, 0.24, "Your demo video goes here", size=12, bold=True, color=WHITE, align="c", wrap=False)
    text(s, vx, vy + vh / 2 + 0.6, vw, 0.2, "Insert → Video → This Device, then delete this placeholder",
         size=8.5, color="A6A6A6", align="c", wrap=False)
    text(s, 6.98, 1.45, 2.5, 0.18, "IN THE DEMO", size=8.5, bold=True, color=MUTE, spc=0.8, wrap=False)
    demo = ["Chat in Hindi → one recommended plan",
            "Toggle add-ons → the price updates live",
            "Photos in → PASS, ASK or HOLD out",
            "Staff picks up a HOLD in the queue",
            "Order tracked all the way to LIVE"]
    for i, d in enumerate(demo):
        y = 1.74 + i * 0.5
        num_dot(s, str(i + 1), 6.98, y, 0.3, size=10)
        text(s, 7.4, y - 0.02, 2.1, 0.36, d, size=10, anchor="m")
    text(s, 6.98, 4.38, 2.5, 0.56, [{"runs": "Thank you", "size": 16, "bold": True, "color": RED, "after": 2},
                                     [("Team The Boys", {"bold": True, "color": INK}),
                                      ("  ·  NIT Kurukshetra", {"color": GREY})]], size=10)
    notes(s, "Here is the three-minute demo of the full journey, customer side and staff side. [Play video.] Thank you.")

    cp = prs.core_properties
    cp.title = "Airtel Vyapaar Connect"
    cp.subject = "Airtel SYNC hackathon · Track A: Project Udyam Digital"
    cp.author = cp.last_modified_by = "Team The Boys, NIT Kurukshetra"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT))
    fix_content_types(OUT)
    print(OUT)
    for w in WARN:
        print("WARN", w)


if __name__ == "__main__":
    main()
