"use client";

import { useState } from "react";
import styles from "./Vote.module.css";

/**
 * Vertical vote rail: ▲ / score / ▼. Optimistic toggle — clicking the active
 * arrow clears it. Logic unchanged from the original; only restyled.
 */
export default function Vote({
  articleId,
  initial,
  score,
}: {
  articleId: number;
  initial: number | null;
  score: number;
}) {
  const [vote, setVote] = useState<number | null>(initial);
  const [pending, setPending] = useState(false);

  async function cast(value: 1 | -1) {
    if (pending) return;
    const prev = vote;
    setVote(vote === value ? null : value); // optimistic toggle
    setPending(true);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId, value }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "vote failed");
      setVote(data.value === 0 ? null : data.value);
    } catch {
      setVote(prev);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.rail}>
      <button
        className={`${styles.btn} ${vote === 1 ? styles.up : ""}`}
        onClick={() => cast(1)}
        disabled={pending}
        aria-label="More like this"
      >
        ▲
      </button>
      <span className={styles.score}>{score.toFixed(1)}</span>
      <button
        className={`${styles.btn} ${vote === -1 ? styles.down : ""}`}
        onClick={() => cast(-1)}
        disabled={pending}
        aria-label="Less like this"
      >
        ▼
      </button>
    </div>
  );
}
