"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button, Dialog, ErrorNote, Field, Status } from "./ui";
import { useSession } from "./session";

const Ctx = createContext<{ openHelp: () => void }>({ openHelp: () => {} });
export const useHelp = () => useContext(Ctx);

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openHelp = useCallback(() => setOpen(true), []);
  return (
    <Ctx.Provider value={{ openHelp }}>
      {children}
      <HelpDialog open={open} onClose={() => setOpen(false)} />
    </Ctx.Provider>
  );
}

function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("help");
  const user = useSession();
  const [note, setNote] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function send() {
    setBusy(true); setErr(null);
    try {
      const a = await api("/api/help", { body: { note, name: user ? undefined : name, phone: user ? undefined : phone } });
      setStatus(a.help.status);
      window.dispatchEvent(new Event("sync:app"));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  const close = () => { onClose(); setTimeout(() => setStatus(null), 300); };

  return (
    <Dialog open={open} onClose={close} title={t("title")}>
      {status ? (
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-ok" aria-hidden />
          <div className="h2">{t("sent")}</div>
          <p className="mt-1 text-muted">{t("sentBody")}</p>
          <div className="mt-4 flex justify-center"><Status s={status} /></div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <p className="text-sm text-muted">{t("body")}</p>
          {user === null && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("name")}><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required minLength={2} /></Field>
              <Field label={t("phone")}><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" required placeholder="98XXXXXXXX" /></Field>
            </div>
          )}
          <Field label={t("note")}><textarea className="input min-h-24" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Field>
          <ErrorNote error={err} />
          <Button className="w-full" loading={busy}>{t("send")}</Button>
        </form>
      )}
    </Dialog>
  );
}
