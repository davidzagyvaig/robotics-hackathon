import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrailleBuddy — feel your way into reading",
  description:
    "A voice-guided braille teaching box. Talk to a patient tutor and feel six dots rise and fall under your fingers — one letter at a time.",
};

// Fonts via <link> (not next/font) so builds never depend on a build-time font fetch.
// Display: Fraunces (warm characterful serif). UI: Hanken Grotesk. Codes: JetBrains Mono.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..600&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-display: 'Fraunces', serif;
            --font-sans: 'Hanken Grotesk', system-ui, sans-serif;
            --font-mono: 'JetBrains Mono', ui-monospace, monospace;
          }
        `}</style>
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
