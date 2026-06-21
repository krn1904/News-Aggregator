import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "News Aggregator",
  description: "Personalized, multi-source, self-learning news app.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
