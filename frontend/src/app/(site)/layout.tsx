"use client";
import { MotionConfig } from "motion/react";
import { HelpProvider } from "@/components/HelpDialog";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <HelpProvider>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </HelpProvider>
    </MotionConfig>
  );
}
