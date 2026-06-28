"use client";

import { useState } from "react";
import styles from "./Summary.module.css";

/**
 * On-demand AI summary. First click POSTs /api/enrich (cost-on-click); a cached
 * summary is a free show/hide toggle. Logic unchanged — only restyled to the
 * "✦ AI Brief" pill + inset.
 */
export default function Summary({
  articleId,
  initial,
}: {
  articleId: number;
  initial: string | null;
}) {
  const [summary, setSummary] = useState<string | null>(initial);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (summary) {
      setOpen((o) => !o);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId }),
      });
      const data = await res.json();
      if (!data.ok || !data.detailSummary) {
        throw new Error("Couldn’t summarize this one — open the link instead.");
      }
      setSummary(data.detailSummary);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Summary failed.");
    } finally {
      setLoading(false);
    }
  }

  const isOpen = open && !!summary;
  const label = loading
    ? "Summarizing…"
    : summary
      ? isOpen
        ? "Hide summary"
        : "Show summary"
      : "Summarize";

  return (
    <div className={styles.wrap}>
      <button
        className={`${styles.pill} ${isOpen ? styles.pillOpen : ""}`}
        onClick={onClick}
        disabled={loading}
      >
        {loading ? <span className={styles.spinner} aria-hidden /> : <span className={styles.spark}>✦</span>}
        {label}
      </button>

      {loading && (
        <div className={styles.inset} aria-hidden>
          <span className={`${styles.shimmer} ${styles.line}`} />
          <span className={`${styles.shimmer} ${styles.lineShort}`} />
        </div>
      )}

      {error && !loading && (
        <div className={`${styles.inset} ${styles.insetError}`}>
          <p className={styles.errorText}>{error}</p>
        </div>
      )}

      {isOpen && (
        <div className={styles.inset}>
          <div className={styles.kicker}>
            <span className={styles.spark}>✦</span> AI Brief <span className={styles.gemini}>· Gemini</span>
          </div>
          <p className={styles.body}>{summary}</p>
        </div>
      )}
    </div>
  );
}
