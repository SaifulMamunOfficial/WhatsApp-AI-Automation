import type { Metadata, Viewport } from "next";
import { Hind_Siliguri, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Latin glyphs: Plus Jakarta Sans (friendly, modern). Bengali glyphs: Hind Siliguri (clear,
// well-proportioned Bangla UI face). The CSS font stack lists them in this order, so each
// script falls through to the right face. Chosen with the ui-ux-pro-max font data.
const latin = Plus_Jakarta_Sans({ variable: "--font-latin", subsets: ["latin"], display: "swap" });
const bengali = Hind_Siliguri({ variable: "--font-bengali", subsets: ["bengali", "latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "Saimum CRM",
  description: "Saimum Shilpigosthi's own CRM",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FAF9F6",
};

// Runs before first paint: applies the saved theme (default: light, whatever the OS prefers),
// so switching to dark never flashes white on load.
const THEME_SCRIPT = `try{var l=document.cookie.match(/(?:^|; )lang=(en|bn)/);document.documentElement.lang=l?l[1]:"en"}catch(e){}try{var t=localStorage.getItem("theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script above sets data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${latin.variable} ${bengali.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
