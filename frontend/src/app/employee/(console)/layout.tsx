"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Inbox, LogOut, ScanSearch } from "lucide-react";
import { logout } from "@/lib/api";
import Logo from "@/components/Logo";
import { useSession } from "@/components/session";
import { cn } from "@/components/ui";

const NAV = [
  { href: "/employee", label: "My work", icon: Inbox },
  { href: "/employee/kyc", label: "KYC check", icon: ScanSearch },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = useSession("employee");
  const router = useRouter();
  const path = usePathname();
  useEffect(() => { if (user === null) router.replace("/employee/login"); }, [user, router]);
  if (!user) return null;
  const active = (h: string) => (h === "/employee" ? path === "/employee" || /^\/employee\/\d+/.test(path) : path.startsWith(h));
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 bg-night-gradient text-white shadow-[0_8px_24px_-16px_rgb(0_0_0/0.6)]">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-4 sm:px-6">
          <Logo href="/employee" tone="light" suffix="Staff" />
          <nav className="flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={cn("inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition",
                active(href) ? "bg-white text-ink" : "text-white/70 hover:bg-white/10 hover:text-white")}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden items-center gap-2 text-white/70 sm:flex">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 font-bold text-white">{(user.name || "S").slice(0, 1)}</span>{user.name}
            </span>
            <button onClick={() => { logout("employee"); router.replace("/employee/login"); }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-white/75 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
      <p className="mx-auto max-w-[1400px] px-6 pb-6 text-xs text-muted">Prototype on synthetic data. KYC results use the supplied mock registries and are not an official verification. Call and WhatsApp buttons are a demo (not integrated).</p>
    </div>
  );
}
