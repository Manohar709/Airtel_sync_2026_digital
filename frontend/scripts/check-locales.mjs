// Fails if any locale is missing keys, has extra keys, or changed a {placeholder}. Usage: node scripts/check-locales.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n", "messages");
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) =>
  typeof v === "object" ? flat(v, p + k + "\u0000") : [[p + k, v]]);
const ph = (s) => (s.match(/\{[a-zA-Z_]+\}/g) || []).sort().join(",");
const en = new Map(flat(JSON.parse(readFileSync(join(dir, "en.json"), "utf8"))));
let bad = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en.json")) {
  const m = new Map(flat(JSON.parse(readFileSync(join(dir, f), "utf8"))));
  const missing = [...en.keys()].filter((k) => !m.has(k));
  const extra = [...m.keys()].filter((k) => !en.has(k));
  const phBad = [...en.keys()].filter((k) => m.has(k) && ph(en.get(k)) !== ph(m.get(k)));
  const show = (a) => a.slice(0, 5).map((k) => k.replaceAll("\u0000", ".")).join(", ");
  if (missing.length || extra.length || phBad.length) {
    bad++;
    console.log(`${f}: missing ${missing.length} [${show(missing)}] extra ${extra.length} [${show(extra)}] placeholder ${phBad.length} [${show(phBad)}]`);
  } else console.log(`${f}: ok (${m.size} keys)`);
}
console.log(bad ? `FAILED (${bad} locale files)` : `ALL LOCALES MATCH en.json (${en.size} keys)`);
process.exit(bad ? 1 : 0);
