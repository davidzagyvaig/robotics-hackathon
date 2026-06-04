import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BrailleBuddy — learn to read Braille",
  description:
    "A voice-guided braille teaching box. Plug in the device, talk to your tutor, and feel the dots.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-mono">{children}</body>
    </html>
  );
}
