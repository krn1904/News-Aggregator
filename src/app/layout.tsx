import type { Metadata } from "next";
import { Newsreader, JetBrains_Mono } from "next/font/google";
import "../styles/tokens.css";
import "./globals.css";
import styles from "./layout.module.css";
import PollProvider from "@/components/PollProvider/PollProvider";
import Masthead from "@/components/Masthead/Masthead";

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Brief — your feed, learned one read at a time",
  description: "Personalized, multi-source, self-learning news.",
};

export const dynamic = "force-dynamic";

// Runs before paint: set the theme from localStorage / OS preference so there's
// no light-then-dark flash on load. Mirrors the key ThemeToggle writes.
const themeScript = `(function(){try{var t=localStorage.getItem('brief-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <PollProvider>
          <Masthead />
          <main className={styles.main}>{children}</main>
        </PollProvider>
      </body>
    </html>
  );
}
