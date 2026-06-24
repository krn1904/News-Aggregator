"use client";

import { useState } from "react";

/**
 * Thumbs up/down for a story (acts on its representative article). Optimistic:
 * updates immediately, reconciles with the server's returned state, reverts on
 * error. Toggle semantics live on the server — we just send the clicked
 * direction and trust the response.
 */
export default function Vote({ articleId, initial }: { articleId: number; initial: number | null }) {
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
      setVote(prev); // revert on failure
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="vote">
      <button
        className={`vbtn${vote === 1 ? " on up" : ""}`}
        onClick={() => cast(1)}
        disabled={pending}
        aria-label="More like this"
        title="More like this"
      >
        ▲
      </button>
      <button
        className={`vbtn${vote === -1 ? " on down" : ""}`}
        onClick={() => cast(-1)}
        disabled={pending}
        aria-label="Less like this"
        title="Less like this"
      >
        ▼
      </button>
    </span>
  );
}
