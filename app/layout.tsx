import type { Metadata, Viewport } from "next";
import { Geist, IBM_Plex_Sans_Arabic } from "next/font/google";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
// Arabic names are a small part of most screens: the font downloads when the
// first Arabic text shows, instead of holding up every page.
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  preload: false,
});

// Open the connection to Supabase while the app's code is still loading.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export const metadata: Metadata = {
  title: { default: "NUMU OS", template: "%s · NUMU OS" },
  description: "Retainers, deliverables, approvals and money in one place.",
  applicationName: "NUMU OS",
  // Installable on phones ("Add to Home Screen") so the team can move cards from a shoot.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "NUMU OS", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${plexArabic.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {SUPABASE_URL ? <link rel="preconnect" href={SUPABASE_URL} crossOrigin="anonymous" /> : null}
      </head>
      <body className="min-h-full bg-bg text-ink">{children}</body>
    </html>
  );
}
