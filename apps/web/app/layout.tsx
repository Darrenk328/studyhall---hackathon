import type { Metadata, Viewport } from "next";
import { Figtree, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const ui = Figtree({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: "Studyhall",
  description: "Answers with receipts. Every claim checked against the live web. Studyhall reads the live web, checks every claim against its source, and can fact-check other AI answers.",
};

export const viewport: Viewport = {
  themeColor: "#0D0E14",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
