import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrailleBuddy — learn braille, by ear and by touch",
  description:
    "A playful, voice-guided braille tutor. Talk to a friendly coach and feel six dots rise — one letter at a time. Built for blind learners and curious sighted ones alike.",
};

// Nunito (the rounded, friendly weights) via <link> — no inline <style>, so server and
// client markup match (no hydration mismatch).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Fredoka — closest free match to Duolingo's proprietary "Feather Bold"
            (rounded, friendly, geometric). Swap to a licensed Feather Bold via @font-face
            in globals.css if you have the file. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
