const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Indian digit grouping, e.g. ₹1,23,456 */
export const inr = (n: number | null | undefined) => (n == null ? "-" : "₹" + nf.format(Math.round(n)));
export const inrRange = (min: number, max: number) => (min === max ? inr(min) : `${inr(min)} – ${inr(max)}`);
export const shortDate = (d: string | Date | null | undefined, locale = "en") => {
  if (!d) return "";
  const v = typeof d === "string" ? new Date(d.endsWith("Z") || d.includes("+") ? d : d + "Z") : d;
  try { return v.toLocaleDateString(locale + "-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return v.toDateString(); }
};
export const dateTime = (d: string | null | undefined, locale = "en") => {
  if (!d) return "";
  const v = new Date(d.endsWith("Z") || d.includes("+") ? d : d + "Z");
  try { return v.toLocaleString(locale + "-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); }
  catch { return v.toString(); }
};
