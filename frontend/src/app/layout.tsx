import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/600.css";
import "@fontsource/noto-sans-telugu/400.css";
import "@fontsource/noto-sans-telugu/600.css";
import "@fontsource/noto-sans-tamil/400.css";
import "@fontsource/noto-sans-tamil/600.css";
import "@fontsource/noto-sans-kannada/400.css";
import "@fontsource/noto-sans-kannada/600.css";
import "@fontsource/noto-sans-malayalam/400.css";
import "@fontsource/noto-sans-malayalam/600.css";
import "@fontsource/noto-sans-bengali/400.css";
import "@fontsource/noto-sans-bengali/600.css";
import "@fontsource/noto-sans-gujarati/400.css";
import "@fontsource/noto-sans-gujarati/600.css";
import "@fontsource/noto-sans-gurmukhi/400.css";
import "@fontsource/noto-sans-gurmukhi/600.css";
import "./globals.css";
import I18nProvider from "@/i18n/I18nProvider";

export const metadata: Metadata = {
  title: "SYNC · Business connectivity, made simple",
  description: "Prototype: describe your business, get the right connectivity plan, verify and submit online. Not an official Airtel service.",
};
export const viewport: Viewport = { themeColor: "#e40000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-script="latin">
      <body className="min-h-screen">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
