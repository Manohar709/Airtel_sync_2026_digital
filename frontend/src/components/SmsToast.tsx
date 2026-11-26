"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

/** Phone-style notification for a one-time code. There is no SMS gateway in this prototype, so the code the backend
 *  issues is delivered here; tapping it fills the code field. */
export default function SmsToast({ code, to, onUse }: { code?: string | null; to?: string | null; onUse?: (code: string) => void }) {
  const t = useTranslations("sms");
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!code) return;
    setShow(true);
    const id = setTimeout(() => setShow(false), 25000);
    return () => clearTimeout(id);
  }, [code]);
  return (
    <AnimatePresence>
      {show && code && (
        <motion.button type="button" initial={{ y: -90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -90, opacity: 0 }}
          transition={{ type: "spring", damping: 24, stiffness: 300 }}
          onClick={() => { onUse?.(code); setShow(false); }}
          className="fixed left-1/2 top-4 z-[60] w-[min(92vw,380px)] -translate-x-1/2 rounded-[22px] bg-white/95 p-3.5 text-left shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)] ring-1 ring-black/5 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <span className="grid h-5 w-5 place-items-center rounded-md bg-[#34c759] text-white"><MessageSquare className="h-3 w-3" /></span>
            {t("app")}<span className="ml-auto normal-case tracking-normal">{t("now")}</span>
          </div>
          <div className="mt-1.5 text-sm font-bold text-ink">AIRTEL VYAPAAR{to ? <span className="ml-1 font-normal text-muted">· {to}</span> : null}</div>
          <div className="text-sm text-ink-2">{t("body", { code })}</div>
          <div className="mt-1 text-xs font-semibold text-brand">{t("tap")}</div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
