// API client. Customer and employee sessions are stored separately; visitors get a server-signed guest token.
const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type User = { id: number; name: string; role: "customer" | "employee"; email: string; phone?: string | null; language?: string | null };
type Who = "customer" | "employee";
const K = {
  customer: { token: "sync_token", user: "sync_user" },
  employee: { token: "sync_emp_token", user: "sync_emp_user" },
  guest: "sync_guest",
};

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};

export function getUser(who: Who = "customer"): User | null {
  const s = ls.get(K[who].user);
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}
export function setSession(who: Who, token: string, user: User) {
  ls.set(K[who].token, token);
  ls.set(K[who].user, JSON.stringify(user));
  if (who === "customer") ls.del(K.guest); // guest work was merged into the account
  window.dispatchEvent(new Event("sync:session"));
}
/** Clears this browser's session so the next person starts fresh. Account data stays on the server. */
export function logout(who: Who = "customer") {
  ls.del(K[who].token);
  ls.del(K[who].user);
  if (who === "customer") ls.del(K.guest);
  window.dispatchEvent(new Event("sync:session"));
}
export const guestToken = () => ls.get(K.guest);

let guestPromise: Promise<string> | null = null;
async function ensureGuest(): Promise<string> {
  const g = ls.get(K.guest);
  if (g) return g;
  guestPromise ??= fetch(BASE + "/api/guest", { method: "POST" })
    .then((r) => { if (!r.ok) throw new Error("guest"); return r.json(); })
    .then((j) => { ls.set(K.guest, j.guest_token); return j.guest_token as string; })
    .finally(() => { guestPromise = null; });
  return guestPromise;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type Opts = { method?: string; body?: unknown; form?: FormData; as?: Who; retry?: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const who = opts.as || "customer";
  const headers: Record<string, string> = {};
  const token = ls.get(K[who].token);
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (who === "customer" && !path.startsWith("/api/auth") && !path.startsWith("/api/i18n")) {
    try { headers["X-Guest-Token"] = await ensureGuest(); } catch { throw new ApiError("offline", 0); }
  }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: opts.method || (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError("offline", 0);
  }
  if (res.status === 401 && !path.startsWith("/api/auth")) {
    if (token) logout(who); else if (who === "customer") ls.del(K.guest);
    if (!opts.retry && who === "customer" && !path.startsWith("/api/kyc") && !path.startsWith("/api/orders")
        && !path.startsWith("/api/application/submit")) {
      return api<T>(path, { ...opts, retry: true }); // continue as a fresh guest
    }
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? j.detail[0]?.msg || msg : msg;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

export async function documentUrl(id: number, who: Who = "customer"): Promise<string> {
  const res = await fetch(`${BASE}/api/documents/${id}/file`, { headers: { Authorization: `Bearer ${ls.get(K[who].token)}` } });
  if (!res.ok) throw new ApiError("Could not load document", res.status);
  return URL.createObjectURL(await res.blob());
}

export const apiBase = BASE;

/** Protected image (or file) fetched with the session token and turned into an object URL for <img>. */
export async function authBlobUrl(path: string, who: Who = "employee"): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${ls.get(K[who].token)}` } });
  if (!res.ok) throw new ApiError("Could not load file", res.status);
  return URL.createObjectURL(await res.blob());
}
