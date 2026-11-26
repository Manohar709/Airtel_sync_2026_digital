/* Airtel Vyapaar Connect: High-level design, drawn in Excalidraw style.
 * Builds an Excalidraw scene (elements + files), renders it with rough.js into #s,
 * and exposes window.__scene for export as an editable .excalidraw file.
 * Injected globals: ICONS {name: svgString}, STANDALONE (bool).
 */
(async () => {
  const W = 1880, H = 780;
  const C = {
    ink: "#1e1e1e", grey: "#495057", mute: "#868e96", line: "#ced4da",
    red: "#e03131", redDark: "#c92a2a", redFill: "#fff5f5", redFill2: "#ffe3e3",
    green: "#2f9e44", greenDark: "#2b8a3e", greenFill: "#ebfbee",
    indigo: "#3b5bdb", indigoFill: "#edf2ff",
    violet: "#7048e8", violetFill: "#f3f0ff",
    amber: "#e8590c", amberFill: "#fff4e6",
    yellow: "#f59f00", yellowFill: "#fff9db",
    slate: "#343a40", greyFill: "#f8f9fa",
    note: "#ffec99",
  };
  // grid: actor column on the left, five aligned columns
  const LEFT = 216, RIGHT = W - 8;
  const COLX = [232, 561, 890, 1219, 1548];
  const CW = 307;
  const cx = (i) => COLX[i] + CW / 2;
  const FS = { title: 28, body: 21, small: 18, badge: 16, tag: 19 };

  const els = [];
  const files = {};
  let seed = 1201;
  const FAM = { hand: 5, sans: 6 };
  const CSSFAM = { 5: "Excalifont", 6: "Nunito" };
  const METRICS = { 5: { upem: 1000, asc: 886, desc: -374 }, 6: { upem: 1000, asc: 1011, desc: -353 } };
  const LAYER = { rectangle: 0, ellipse: 0, image: 0, line: 1, arrow: 1, text: 2 };

  await Promise.all([
    document.fonts.load('28px "Excalifont"'),
    document.fonts.load('400 20px "Nunito"'),
    document.fonts.load('600 20px "Nunito"'),
    document.fonts.load('700 20px "Nunito"'),
    document.fonts.load('800 20px "Nunito"'),
  ]);
  const ctx = document.createElement("canvas").getContext("2d");

  function base(type, x, y, w, h, o = {}) {
    const s = seed++;
    return {
      id: `${type[0]}${s}`, type, x, y, width: w, height: h, angle: o.angle || 0,
      strokeColor: o.stroke ?? C.ink, backgroundColor: o.fill ?? "transparent",
      fillStyle: o.fillStyle || "solid", strokeWidth: o.sw ?? 2, strokeStyle: o.dash || "solid",
      roughness: o.rough ?? 1, opacity: o.opacity ?? 100, groupIds: [], frameId: null,
      roundness: null, seed: (s * 7919) % 2147483647, version: 1, versionNonce: (s * 104729) % 2147483647,
      isDeleted: false, boundElements: null, updated: 1764160000000, link: null, locked: false,
    };
  }
  function rect(x, y, w, h, o = {}) {
    const e = base("rectangle", x, y, w, h, o);
    e.roundness = o.square ? null : { type: 3 };
    els.push(e); return e;
  }
  function ellipse(x, y, w, h, o = {}) {
    const e = base("ellipse", x, y, w, h, o);
    els.push(e); return e;
  }
  function measure(str, fs, fam, bold) {
    ctx.font = `${bold ? (bold === true ? 800 : bold) : 400} ${fs}px "${CSSFAM[fam]}"`;
    const lines = str.split("\n");
    return { w: Math.max(...lines.map((l) => ctx.measureText(l).width)), h: lines.length * fs * 1.25 };
  }
  // text: (x, y) is the anchor (left / center / right per align) at the top edge
  function text(x, y, str, o = {}) {
    const fam = FAM[o.font || "sans"], fs = o.size || FS.body;
    const m = measure(str, fs, fam, o.bold);
    const align = o.align || "left";
    const tx = align === "center" ? x - m.w / 2 : align === "right" ? x - m.w : x;
    const e = base("text", tx, y, Math.ceil(m.w), m.h, { stroke: o.color || C.ink, sw: 1, rough: 0, angle: o.angle });
    Object.assign(e, {
      text: str, originalText: str, fontSize: fs, fontFamily: fam, textAlign: align, verticalAlign: "top",
      containerId: null, autoResize: true, lineHeight: 1.25,
    });
    if (o.bold) e.customData = { bold: o.bold === true ? 800 : o.bold };
    if (o.maxW && m.w > o.maxW) console.warn("TOO WIDE", str, Math.round(m.w), ">", o.maxW);
    els.push(e); return e;
  }
  function path(type, pts, o = {}) {
    const [x0, y0] = pts[0];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const e = base(type, x0, y0, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), o);
    Object.assign(e, {
      points: pts.map(([x, y]) => [x - x0, y - y0]), lastCommittedPoint: null,
      startBinding: null, endBinding: null,
      startArrowhead: type === "arrow" ? (o.start ?? null) : null,
      endArrowhead: type === "arrow" ? (o.end === undefined ? "arrow" : o.end) : null,
      roundness: o.curve ? { type: 2 } : null,
    });
    if (type === "arrow") e.elbowed = false;
    els.push(e); return e;
  }
  const arrow = (pts, o) => path("arrow", pts, o);
  function icon(name, x, y, size, color) {
    let svg = ICONS[name];
    if (!svg) throw new Error("icon " + name);
    svg = svg.replace(/stroke="currentColor"/g, `stroke="${color}"`)
      .replace(/width="24"/, `width="${size}"`).replace(/height="24"/, `height="${size}"`);
    const fileId = `icon-${name}-${color.replace("#", "")}`;
    const dataURL = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    files[fileId] = { mimeType: "image/svg+xml", id: fileId, dataURL, created: 1764160000000, lastRetrieved: 1764160000000 };
    const e = base("image", x, y, size, size, { stroke: "transparent", sw: 1, rough: 0 });
    Object.assign(e, { fileId, status: "saved", scale: [1, 1], crop: null });
    els.push(e); return e;
  }
  // pill badge; returns its right edge
  function badge(x, y, label, o = {}) {
    const fs = o.size || FS.badge, bold = o.bold ?? 700;
    const m = measure(label, fs, FAM.sans, bold);
    const h = o.h || 28, padX = o.padX ?? 11;
    rect(x, y, m.w + padX * 2, h, { stroke: o.stroke || C.slate, fill: o.fill || "#ffffff", sw: o.sw ?? 1, rough: o.rough ?? 0 });
    text(x + padX, y + (h - fs * 1.25) / 2, label, { size: fs, color: o.color || o.stroke || C.slate, bold });
    return x + m.w + padX * 2;
  }
  function numDot(x, y, label, color, d = 36) {
    ellipse(x, y, d, d, { stroke: color, fill: color, sw: 1, rough: 0 });
    const fs = d > 32 ? 21 : 18;
    text(x + d / 2, y + d / 2 - (fs * 1.25) / 2, label, { size: fs, color: "#ffffff", bold: 800, align: "center" });
  }
  function iconDot(name, x, y, color, d = 36) {
    ellipse(x, y, d, d, { stroke: color, fill: color, sw: 1, rough: 0 });
    icon(name, x + d * 0.2, y + d * 0.2, d * 0.6, "#ffffff");
  }
  function lines(x, y, arr, o = {}) {
    arr.forEach((l, k) => text(x, y + k * (o.gap || 27), l, { size: o.size || FS.body, color: o.color || C.grey, bold: o.bold, maxW: o.maxW }));
  }
  const inner = CW - 34;

  /* ================= 1. CUSTOMER LANE ================= */
  const CL = { y: 0, h: 176 };
  rect(0, CL.y, W, CL.h, { stroke: C.red, fill: C.redFill, sw: 2 });
  rect(12, 10, 192, 158, { stroke: C.red, fill: "#ffffff", sw: 2 });
  iconDot("store", 83, 20, C.red, 50);
  text(108, 74, "Customer", { font: "hand", size: FS.title, align: "center" });
  text(108, 110, "MSME owner · phone", { size: 17, color: C.grey, align: "center", bold: 600 });
  text(108, 134, "हिंदी · English · తెలుగు", { size: 16, color: C.grey, align: "center", bold: 600 });
  let bx = text(COLX[0], 12, "CUSTOMER PORTAL", { size: FS.tag, color: C.red, bold: 800 });
  bx = COLX[0] + bx.width + 16;
  for (const b of ["Next.js 16", "React 19", "TypeScript", "Tailwind v4", "next-intl", "Web Speech API"]) {
    bx = badge(bx, 8, b, { stroke: C.red }) + 8;
  }
  text(W - 26, 12, "guest first · sign in only to verify", { size: FS.small, color: C.grey, align: "right", bold: 600 });

  const STEPY = 46, STEPH = 122;
  const steps = [
    ["1", "Chat or speak", ["a few quick questions", "tap chips or just talk"]],
    ["2", "Plan & price", ["one eligible bundle", "+/− add-ons, live price"]],
    ["3", "Verify", ["consent → OTP → photos", "DigiLocker · no-GST path"]],
    ["4", "Sign · pay · track", ["OTP e-sign · UPI AutoPay", "My Orders: ETA → LIVE"]],
  ];
  steps.forEach(([n, t, ls], i) => {
    const x = COLX[i];
    rect(x, STEPY, CW, STEPH, { stroke: C.red, fill: "#ffffff", sw: 2 });
    numDot(x + 14, STEPY + 14, n, C.red);
    text(x + 60, STEPY + 14, t, { font: "hand", size: FS.title });
    lines(x + 18, STEPY + 62, ls, { maxW: inner });
    if (i < steps.length - 1) arrow([[x + CW + 3, STEPY + STEPH / 2], [COLX[i + 1] - 3, STEPY + STEPH / 2]], { stroke: C.red, sw: 2 });
  });
  {
    const x = COLX[4];
    rect(x, STEPY, CW, STEPH, { stroke: C.red, fill: C.redFill2, sw: 2 });
    iconDot("headset", x + 14, STEPY + 14, C.red);
    text(x + 60, STEPY + 14, "Talk to a person", { font: "hand", size: FS.title });
    lines(x + 18, STEPY + 62, ["button on every page", "reaches staff instantly"], { maxW: inner });
  }

  /* ================= 2. PRIVACY SHIELD ================= */
  const SB = { y: 198, h: 38 };
  rect(LEFT, SB.y, RIGHT - LEFT, SB.h, { stroke: C.green, fill: C.greenFill, sw: 2 });
  icon("shield-check", LEFT + 14, SB.y + 6, 26, C.greenDark);
  const sbt = text(LEFT + 48, SB.y + 7, "PRIVACY SHIELD", { size: FS.tag, color: C.greenDark, bold: 800 });
  text(LEFT + 48 + sbt.width + 20, SB.y + 7,
    "JWT + signed guest token  ·  bcrypt passwords  ·  ownership checks  ·  rate limits  ·  consent first  ·  PII redacted before AI  ·  masked IDs",
    { size: FS.tag, color: C.greenDark, bold: 600, maxW: RIGHT - LEFT - 260 });

  /* ================= 3. BACKEND (our server) ================= */
  const BE = { y: 252, h: 354 };
  for (let i = 0; i < 5; i++) {
    arrow([[cx(i), CL.h + 2], [cx(i), SB.y - 2]], { stroke: C.greenDark, sw: 2, start: "arrow", rough: 0.5 });
    arrow([[cx(i), SB.y + SB.h + 2], [cx(i), BE.y - 2]], { stroke: C.greenDark, sw: 2, start: "arrow", rough: 0.5 });
  }
  text(cx(0) + 12, CL.h + 1, "HTTPS · JSON", { size: 15, color: C.greenDark, bold: 800 });
  rect(LEFT, BE.y, RIGHT - LEFT, BE.h, { stroke: C.slate, fill: C.greyFill, sw: 2 });
  let hx = text(COLX[0], BE.y + 12, "BACKEND · our server", { size: FS.tag, color: C.slate, bold: 800 });
  hx = COLX[0] + hx.width + 16;
  for (const b of ["FastAPI", "Python", "SQLAlchemy", "Pydantic", "PostgreSQL"]) hx = badge(hx, BE.y + 8, b, { stroke: C.slate }) + 8;
  text(W - 34, BE.y + 7, "AI understands. Backend decides.", { font: "hand", size: 28, color: C.redDark, align: "right" });

  const MY = 302, MH = 184;
  const mods = [
    { n: "1", t: "AI Advisor", ic: "sparkles", ls: ["asks the next question", "explains in plain words", "basic mode if AI fails"] },
    { n: "2", t: "Rules & Quote", ic: "calculator", ls: ["25 products, real rules", "city tier · size · GSTIN", "one price + add-ons"] },
    { n: "3", t: "Smart KYC", ic: "scan-line", ls: ["GSTIN checksum + registry"] },
    { n: "4", t: "Order Lifecycle", ic: "truck", ls: ["PASS → auto-approved", "technician → LIVE · ETA"] },
    { n: "", t: "Help & Handoff", ic: "life-buoy", ls: ["live help requests", "urgency-ranked queue", "auto message on return"] },
  ];
  mods.forEach((m, i) => {
    const x = COLX[i];
    rect(x, MY, CW, MH, { stroke: C.slate, fill: "#ffffff", sw: 2 });
    icon(m.ic, x + 16, MY + 16, 30, C.slate);
    text(x + 54, MY + 14, m.t, { font: "hand", size: 27, maxW: CW - 54 - 50 });
    if (m.n) numDot(x + CW - 44, MY + 14, m.n, C.red, 30);
    else iconDot("headset", x + CW - 44, MY + 14, C.red, 30);
    lines(x + 18, MY + 60, m.ls, { maxW: inner });
  });
  // Smart KYC: local OCR + verdict chips
  {
    const x = COLX[2];
    rect(x + 14, MY + 92, CW - 28, 54, { stroke: C.yellow, fill: C.yellowFill, sw: 1, rough: 0.6 });
    icon("scan-text", x + 26, MY + 106, 26, C.slate);
    text(x + 62, MY + 96, "PaddleOCR on our server", { size: FS.small, color: C.slate, bold: 800, maxW: CW - 76 });
    text(x + 62, MY + 120, "straightens · cleans scans", { size: 16, color: C.grey, bold: 600, maxW: CW - 76 });
    const cy = MY + 152;
    badge(x + 16, cy, "ASK", { stroke: C.amber, fill: C.amberFill, color: C.amber, h: 26, padX: 11 });
    badge(cx(2) - 33, cy, "HOLD", { stroke: C.red, fill: C.redFill2, color: C.redDark, h: 26, padX: 11 });
    badge(x + CW - 80, cy, "PASS", { stroke: C.green, fill: C.greenFill, color: C.greenDark, h: 26, padX: 11 });
  }
  // Order Lifecycle: simulated rails (dashed = simulated today)
  {
    const x = COLX[3], by = MY + 124;
    rect(x + 14, by, CW - 28, 54, { stroke: C.mute, fill: C.greyFill, sw: 1.5, dash: "dashed", rough: 0.6 });
    const tg = measure("SIMULATED", 13, FAM.sans, 800);
    rect(x + 26, by - 9, tg.w + 12, 18, { stroke: C.greyFill, fill: C.greyFill, sw: 1, rough: 0 });
    text(x + 32, by - 8, "SIMULATED", { size: 13, color: C.mute, bold: 800 });
    text(x + 26, by + 14, "OTP · DigiLocker · eSign · UPI", { size: 17, color: C.grey, bold: 700, maxW: CW - 52 });
  }
  arrow([[COLX[2] + CW + 2, MY + 165], [COLX[3] - 2, MY + 165]], { stroke: C.green, sw: 2 });   // PASS → order
  arrow([[COLX[4] - 2, MY + 72], [COLX[3] + CW + 2, MY + 72]], { stroke: C.slate, sw: 2 });     // staff approval → order

  // PostgreSQL (c1–c2)
  const DY = 508, DH = 88;
  {
    const x = COLX[0], w = COLX[1] + CW - COLX[0];
    rect(x, DY, w, DH, { stroke: C.yellow, fill: C.yellowFill, sw: 2 });
    icon("database", x + 16, DY + 14, 30, C.slate);
    const t = text(x + 54, DY + 12, "PostgreSQL", { font: "hand", size: FS.title });
    text(x + 54 + t.width + 16, DY + 18, "single source of truth", { size: FS.small, color: C.grey, bold: 700 });
    text(x + 18, DY + 54, "catalogue · mock GSTIN & Udyam registries · applications · events", { size: FS.small, color: C.grey, maxW: w - 30 });
    arrow([[cx(0), MY + MH + 2], [cx(0), DY - 2]], { stroke: C.yellow, sw: 2, dash: "dashed", start: "arrow" });
    arrow([[cx(1), MY + MH + 2], [cx(1), DY - 2]], { stroke: C.yellow, sw: 2, dash: "dashed", start: "arrow" });
    arrow([[COLX[2] + 30, MY + MH + 2], [COLX[1] + CW - 34, DY - 2]], { stroke: C.yellow, sw: 2, dash: "dashed" });
  }
  // legend (sticky note) under Order Lifecycle
  {
    const x = COLX[3] + 8, y = DY - 4, w = CW - 16;
    rect(x, y, w, 96, { stroke: C.yellow, fill: C.note, sw: 1, rough: 0.8, angle: -0.015 });
    text(x + 12, y + 6, "how to read", { font: "hand", size: 20, color: C.slate });
    arrow([[x + 14, y + 47], [x + 54, y + 47]], { stroke: C.red, sw: 2 });
    text(x + 62, y + 36, "user journey", { size: 16, color: C.slate, bold: 700 });
    arrow([[x + 178, y + 47], [x + 218, y + 47]], { stroke: C.yellow, sw: 2, dash: "dashed" });
    text(x + 226, y + 36, "data", { size: 16, color: C.slate, bold: 700 });
    rect(x + 14, y + 66, 40, 20, { stroke: C.mute, fill: C.greyFill, sw: 1.5, dash: "dashed", rough: 0 });
    text(x + 62, y + 65, "simulated → Phase 2", { size: 16, color: C.slate, bold: 700 });
  }

  /* ================= 4. AI, outside our server ================= */
  {
    const x = 12, y = 302, w = 172, h = 150;
    rect(x, y, w, h, { stroke: C.violet, fill: C.violetFill, sw: 2 });
    icon("bot", x + 12, y + 14, 28, C.violet);
    text(x + 46, y + 12, "Gemini", { font: "hand", size: FS.title });
    text(x + 14, y + 52, "2.5 Flash", { size: FS.small, color: C.violet, bold: 800 });
    lines(x + 14, y + 76, ["external API", "chat · explain", "voice · translate"], { size: 17, gap: 23, maxW: w - 20 });
    arrow([[x + w + 3, y + 70], [COLX[0] - 3, y + 70]], { stroke: C.violet, sw: 2, dash: "dashed", start: "arrow" });
    rect(14, 470, 178, 128, { stroke: C.yellow, fill: C.note, sw: 1, rough: 0.8, angle: 0.03 });
    text(103, 480, "Only redacted\ntext reaches AI.\nNo documents.\nNo raw IDs.", { font: "hand", size: 20, color: C.slate, align: "center", angle: 0.03 });
  }

  /* ================= 5. EMPLOYEE LANE ================= */
  const EL = { y: 624, h: 156 };
  rect(0, EL.y, W, EL.h, { stroke: C.indigo, fill: C.indigoFill, sw: 2 });
  rect(12, EL.y + 8, 192, EL.h - 16, { stroke: C.indigo, fill: "#ffffff", sw: 2 });
  iconDot("user-cog", 85, EL.y + 16, C.indigo, 46);
  text(108, EL.y + 66, "Employee", { font: "hand", size: FS.title, align: "center" });
  text(108, EL.y + 100, "Airtel staff", { size: 17, color: C.grey, align: "center", bold: 600 });
  text(108, EL.y + 122, "one secure login", { size: 17, color: C.grey, align: "center", bold: 600 });
  let ex = text(COLX[0], EL.y + 10, "STAFF CONSOLE", { size: FS.tag, color: C.indigo, bold: 800 });
  ex = COLX[0] + ex.width + 16;
  for (const b of ["Next.js /employee", "staff JWT", "masked IDs"]) ex = badge(ex, EL.y + 6, b, { stroke: C.indigo }) + 8;

  const EY = EL.y + 46, EH = 102;
  {
    const x = COLX[0], w = COLX[2] + CW - COLX[0];
    rect(x, EY, w, EH, { stroke: C.indigo, fill: "#ffffff", sw: 2 });
    numDot(x + 14, EY + 14, "A", C.indigo);
    text(x + 60, EY + 12, "Urgency work queue", { font: "hand", size: FS.title });
    lines(x + 18, EY + 54, ["help · KYC holds · SLA risk", "most urgent first, with waiting time"], { size: 19, gap: 23 });
    const rows = [
      [C.red, "Talk to a person", "4 min"],
      [C.amber, "KYC HOLD · GSTIN altered", "18 min"],
      [C.redDark, "Install at risk · 21-day SLA", "2 days"],
    ];
    const rx = x + 420, rw = w - 420 - 14;
    rows.forEach(([col, label, t], k) => {
      const ry = EY + 9 + k * 30;
      rect(rx, ry, rw, 26, { stroke: C.line, fill: "#ffffff", sw: 1, rough: 0 });
      ellipse(rx + 9, ry + 8, 10, 10, { stroke: col, fill: col, sw: 1, rough: 0 });
      text(rx + 28, ry + 2, label, { size: 17, color: C.slate, bold: 700 });
      text(rx + rw - 10, ry + 2, t, { size: 17, color: C.grey, align: "right", bold: 600 });
    });
  }
  [[3, "B", "Case view", ["full context · masked IDs", "one next action"]],
   [4, "C", "Act in one tap", ["call · WhatsApp", "approve · return · close"]]].forEach(([ci, n, t, ls]) => {
    const x = COLX[ci];
    rect(x, EY, CW, EH, { stroke: C.indigo, fill: "#ffffff", sw: 2 });
    numDot(x + 14, EY + 14, n, C.indigo);
    text(x + 60, EY + 12, t, { font: "hand", size: FS.title });
    lines(x + 18, EY + 54, ls, { size: 19, gap: 23, maxW: inner });
  });
  arrow([[COLX[2] + CW + 3, EY + EH / 2], [COLX[3] - 3, EY + EH / 2]], { stroke: C.indigo, sw: 2 });
  arrow([[COLX[3] + CW + 3, EY + EH / 2], [COLX[4] - 3, EY + EH / 2]], { stroke: C.indigo, sw: 2 });

  /* ================= 6. cross-lane flows (drawn on top) ================= */
  // KYC HOLD → staff queue
  arrow([[cx(2), MY + MH + 2], [cx(2), EY - 2]], { stroke: C.red, sw: 2 });
  text(cx(2) + 14, DY + 2, "HOLD →\na person\nchecks", { size: FS.small, color: C.redDark, bold: 800 });
  // help requests + holds ranked → queue ; decisions → help & handoff
  const HX = COLX[4] + 44, DX = COLX[4] + CW - 26, QY = EL.y + 26;
  arrow([[HX, MY + MH + 2], [HX, QY], [1158, QY], [1158, EY - 2]], { stroke: C.indigo, sw: 2 });
  arrow([[DX, EY - 2], [DX, MY + MH + 2]], { stroke: C.indigo, sw: 2 });
  text(HX + 12, DY + 4, "queue items ↓", { size: FS.small, color: C.indigo, bold: 800 });
  text(DX - 12, DY + 44, "decisions ↑", { size: FS.small, color: C.indigo, bold: 800, align: "right" });

  /* ================= standalone title ================= */
  let offY = 0;
  if (STANDALONE) {
    offY = 96;
    for (const e of els) e.y += offY;
    text(0, 6, "Airtel Vyapaar Connect · Solution architecture (HLD)", { font: "hand", size: 40 });
    text(0, 58, "Working prototype · Team The Boys, NIT Kurukshetra · all data synthetic", { size: 19, color: C.grey, bold: 600 });
  }

  // z-order: shapes, then arrows, then text (stable)
  els.forEach((e, i) => (e._i = i));
  els.sort((a, b) => LAYER[a.type] - LAYER[b.type] || a._i - b._i);
  els.forEach((e) => delete e._i);

  /* ================= render with rough.js ================= */
  const svg = document.getElementById("s");
  const NS = "http://www.w3.org/2000/svg";
  const TH = H + offY;
  svg.setAttribute("viewBox", `-6 -6 ${W + 12} ${TH + 12}`);
  svg.setAttribute("width", W + 12); svg.setAttribute("height", TH + 12);
  if (STANDALONE) {
    const bg = document.createElementNS(NS, "rect");
    Object.entries({ x: -6, y: -6, width: W + 12, height: TH + 12, fill: "#ffffff" }).forEach(([k, v]) => bg.setAttribute(k, v));
    svg.appendChild(bg);
  }
  const rc = rough.svg(svg);

  function roughOpts(e) {
    const o = {
      seed: e.seed,
      disableMultiStroke: e.strokeStyle !== "solid",
      strokeWidth: e.strokeStyle !== "solid" ? e.strokeWidth + 0.5 : e.strokeWidth,
      fillWeight: e.strokeWidth / 2, hachureGap: e.strokeWidth * 4,
      roughness: e.roughness, stroke: e.strokeColor, preserveVertices: e.roughness < 2,
    };
    if (e.strokeStyle === "dashed") o.strokeLineDash = [8, 8 + e.strokeWidth];
    if (e.strokeStyle === "dotted") o.strokeLineDash = [1.5, 6 + e.strokeWidth];
    if (e.backgroundColor !== "transparent" && (e.type === "rectangle" || e.type === "ellipse")) {
      o.fill = e.backgroundColor; o.fillStyle = e.fillStyle;
    }
    return o;
  }
  const radius = (e) => { const x = Math.min(e.width, e.height); return x <= 128 ? x * 0.25 : 32; };
  function wrap(e, node) {
    const g = document.createElementNS(NS, "g");
    if (e.angle) g.setAttribute("transform", `rotate(${(e.angle * 180) / Math.PI} ${e.x + e.width / 2} ${e.y + e.height / 2})`);
    if (e.opacity !== 100) g.setAttribute("opacity", e.opacity / 100);
    g.appendChild(node); svg.appendChild(g);
  }
  function arrowHead(pts, sw) {
    const [x2, y2] = pts[pts.length - 1], [x1, y1] = pts[pts.length - 2];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const size = Math.min(14 + sw * 3, len * 0.5);
    const a = Math.atan2(y2 - y1, x2 - x1), sp = (25 * Math.PI) / 180;
    return [[x2 - size * Math.cos(a - sp), y2 - size * Math.sin(a - sp)], [x2, y2], [x2 - size * Math.cos(a + sp), y2 - size * Math.sin(a + sp)]];
  }
  for (const e of els) {
    if (e.type === "rectangle") {
      const o = roughOpts(e);
      const g = document.createElementNS(NS, "g");
      g.setAttribute("transform", `translate(${e.x} ${e.y})`);
      if (e.roundness) {
        const r = radius(e), w = e.width, h = e.height;
        g.appendChild(rc.path(`M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h} L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0`, o));
      } else g.appendChild(rc.rectangle(0, 0, e.width, e.height, o));
      wrap(e, g);
    } else if (e.type === "ellipse") {
      wrap(e, rc.ellipse(e.x + e.width / 2, e.y + e.height / 2, e.width, e.height, roughOpts(e)));
    } else if (e.type === "arrow" || e.type === "line") {
      const o = roughOpts(e);
      const pts = e.points.map(([x, y]) => [x + e.x, y + e.y]);
      const g = document.createElementNS(NS, "g");
      g.appendChild(e.roundness ? rc.curve(pts, o) : rc.linearPath(pts, o));
      const ho = { ...o, strokeLineDash: undefined, disableMultiStroke: false, strokeWidth: e.strokeWidth };
      if (e.endArrowhead) g.appendChild(rc.linearPath(arrowHead(pts, e.strokeWidth), ho));
      if (e.startArrowhead) g.appendChild(rc.linearPath(arrowHead([...pts].reverse(), e.strokeWidth), ho));
      wrap(e, g);
    } else if (e.type === "text") {
      const m = METRICS[e.fontFamily];
      const lh = e.fontSize * e.lineHeight, em = e.fontSize / m.upem;
      const off = em * m.asc + (lh - em * m.asc + em * m.desc) / 2;
      const g = document.createElementNS(NS, "g");
      const ax = e.textAlign === "center" ? e.x + e.width / 2 : e.textAlign === "right" ? e.x + e.width : e.x;
      e.text.split("\n").forEach((ln, i) => {
        const t = document.createElementNS(NS, "text");
        t.setAttribute("x", ax); t.setAttribute("y", e.y + off + i * lh);
        t.setAttribute("font-family", CSSFAM[e.fontFamily]);
        t.setAttribute("font-size", e.fontSize);
        t.setAttribute("fill", e.strokeColor);
        t.setAttribute("text-anchor", e.textAlign === "center" ? "middle" : e.textAlign === "right" ? "end" : "start");
        if (e.customData && e.customData.bold) t.setAttribute("font-weight", e.customData.bold);
        t.setAttribute("style", "white-space: pre");
        t.textContent = ln;
        g.appendChild(t);
      });
      wrap(e, g);
    } else if (e.type === "image") {
      const im = document.createElementNS(NS, "image");
      im.setAttribute("href", files[e.fileId].dataURL);
      Object.entries({ x: e.x, y: e.y, width: e.width, height: e.height }).forEach(([k, v]) => im.setAttribute(k, v));
      wrap(e, im);
    }
  }

  window.__scene = {
    type: "excalidraw", version: 2, source: "https://excalidraw.com",
    elements: els, appState: { gridSize: 20, viewBackgroundColor: "#ffffff" }, files,
  };
  window.__done = true;
})().catch((err) => { window.__error = String((err && err.stack) || err); window.__done = true; });
