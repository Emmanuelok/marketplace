import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Manrope } from "next/font/google";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ConciergeLauncher } from "@/components/concierge/concierge-launcher";
import { env } from "@/lib/env";

import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env().APP_URL),
  title: {
    default: "Nyansa — Premium brands, delivered in Ghana",
    template: "%s · Nyansa",
  },
  description:
    "Authentic Apple, Samsung, Sony, Whirlpool and more. Buy from stock in Accra, or order to ship " +
    "from the US, UK, Canada and China with duties already included in the price.",
  openGraph: {
    type: "website",
    locale: "en_GH",
    siteName: "Nyansa",
    title: "Nyansa — Premium brands, delivered in Ghana",
    description:
      "Buy from stock in Accra, or order to ship from abroad. One price, duties included.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#141312" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * Stamp the stored theme before first paint. Without this the page renders in
 * the OS theme and then flips, which is far more jarring than a slightly later
 * hydration.
 */
const NO_FLASH_SCRIPT = `
(function(){try{var t=localStorage.getItem('nyansa-theme');
if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GH" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
      </head>
      <body className={`${display.variable} ${sans.variable} ${mono.variable}`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-contrast"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="min-h-[60vh]">
          {children}
        </main>
        <SiteFooter />
        <ConciergeLauncher />
      </body>
    </html>
  );
}
