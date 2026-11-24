"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout } from "@/lib/api";
import Logo from "@/components/Logo";
import { useSession } from "@/components/session";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const user = useSession("employee");
  const router = useRouter();
  useEffect(() => { if (user === null) router.replace("/employee/login"); }, [user, router]);
  if (!user) return null;
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 bg-ink text-white">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
          <Logo href="/employee" tone="light" suffix="Employee console" />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-white/70 sm:inline">{user.name}</span>
            <button onClick={() => { logout("employee"); router.replace("/employee/login"); }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold text-white/80 hover:bg-white/10">
              <LogOut className="h-4 w-4" />Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
      <p className="mx-auto max-w-[1400px] px-6 pb-6 text-xs text-muted">Prototype on synthetic data. KYC results come from supplied mock registries and are not official verification. The AI assistant cannot approve KYC or applications.</p>
    </div>
  );
}
