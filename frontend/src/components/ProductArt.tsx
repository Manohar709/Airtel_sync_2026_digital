import { Cable, Cloud, Cctv, Cpu, CreditCard, Globe, HardDriveUpload, Mail, MessageCircle, MessageSquareText, Network,
  PhoneCall, Radio, Router, Server, Shield, ShieldCheck, Smartphone, Truck, Wifi, Zap, type LucideIcon } from "lucide-react";
import { cn } from "./ui";

/* Category artwork drawn in code (no stock or brand imagery). Each product gets its own icon on its category's tone. */
const TONES: Record<string, string> = {
  "Connectivity": "from-[#ff3b30] via-[#e40000] to-[#8f0015]",
  "Communication": "from-[#ff7a59] via-[#e8452c] to-[#a3000f]",
  "Cloud & Productivity": "from-[#3d3f4a] via-[#24262e] to-[#121318]",
  "Security": "from-[#5a0a1c] via-[#3a0612] to-[#1c0409]",
  "IoT & Physical": "from-[#c2410c] via-[#9a2b07] to-[#4d0010]",
};
const ICON: Record<string, LucideIcon> = {
  P01: Router, P02: Router, P03: Zap, P04: Radio, P05: Cable, P06: Server, P07: Smartphone, P08: Smartphone,
  P09: Wifi, P10: Network, P11: Globe, P12: PhoneCall, P13: PhoneCall, P14: MessageSquareText, P15: MessageCircle,
  P16: Mail, P17: HardDriveUpload, P18: Globe, P19: CreditCard, P20: Shield, P21: ShieldCheck, P22: Wifi,
  P23: Cctv, P24: Cpu, P25: Truck,
};
const CAT_ICON: Record<string, LucideIcon> = {
  "Connectivity": Router, "Communication": PhoneCall, "Cloud & Productivity": Cloud, "Security": ShieldCheck, "IoT & Physical": Cpu,
};

export function productIcon(id?: string, category?: string): LucideIcon {
  return (id && ICON[id]) || (category && CAT_ICON[category]) || Router;
}

export default function ProductArt({ id, category, size = "md", className }: { id?: string; category?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = productIcon(id, category);
  const box = { sm: "h-10 w-10 rounded-xl", md: "h-14 w-14 rounded-2xl", lg: "h-24 w-full rounded-2xl" }[size];
  const ic = { sm: "h-5 w-5", md: "h-7 w-7", lg: "h-10 w-10" }[size];
  return (
    <div className={cn("relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br text-white", TONES[category || ""] || TONES.Connectivity, box, className)} aria-hidden>
      <svg className="absolute -right-3 -top-3 h-[120%] w-[120%] opacity-25" viewBox="0 0 100 100" fill="none" stroke="currentColor">
        <circle cx="90" cy="10" r="30" strokeWidth="1.2" /><circle cx="90" cy="10" r="48" strokeWidth="1.2" /><circle cx="90" cy="10" r="66" strokeWidth="1.2" />
      </svg>
      <Icon className={cn("relative drop-shadow-sm", ic)} strokeWidth={1.8} />
    </div>
  );
}
