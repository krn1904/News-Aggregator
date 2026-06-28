"use client";

import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

/**
 * Flips [data-theme] on <html> and persists to localStorage. The label shows the
 * TARGET theme ("Dark" while in light mode). The no-flash script in layout.tsx
 * has already set the initial theme before paint; we just read it on mount.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("brief-theme", next);
    } catch {
      /* ignore storage errors */
    }
    setTheme(next);
  }

  return (
    <button className={styles.toggle} onClick={toggle} aria-label="Toggle colour theme">
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
