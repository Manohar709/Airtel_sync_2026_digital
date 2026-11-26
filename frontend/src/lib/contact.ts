/** Helpers for the employee console: waiting time and one-tap call / WhatsApp links (India numbers). */
export function waited(min: number) {
  if (min < 60) return `${min} min`;
  if (min < 60 * 24) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${Math.floor(min / 1440)} d`;
}
const ten = (p: string) => p.replace(/\D/g, "").slice(-10);
export const telHref = (p?: string | null) => (p ? `tel:+91${ten(p)}` : undefined);
export const waHref = (p?: string | null, text = "") => (p ? `https://wa.me/91${ten(p)}?text=${encodeURIComponent(text)}` : undefined);
