import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NutriReg AI — Enterprise Hub",
  description:
    "Cross-jurisdictional regulatory intelligence for food, beverage, and nutraceutical formulations.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f8f9ff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        {/*
          Font loading mirrors the Stitch export exactly: Inter (400-700) and
          JetBrains Mono (400-500) for data readouts, plus Material Symbols
          Outlined for the icon ligature set used across the approved screens.
          Stylesheet links are intentional: `next/font` would self-host a build
          artifact and change the resolved family names, which would break the
          approved type tokens in tailwind.config.ts.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Icon font uses display=block so ligatures never flash as fallback glyphs. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body className="h-full bg-surface text-on-surface font-body-md text-body-md antialiased">
        {children}
      </body>
    </html>
  );
}
