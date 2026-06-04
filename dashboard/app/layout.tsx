import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DermaScout — Clinician Console",
  description: "Voice-guided 3D skin documentation & longitudinal monitoring station",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-mono">{children}</body>
    </html>
  );
}
