"use client";

import { useState } from "react";

/**
 * On-demand AI summary (Phase 9). If the story already has a cached summary it's
 * a free show/hide toggle; otherwise the first click calls /api/enrich, which
 * generates and caches it. Keeps the cost on the user's click, not every poll.
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
    // Already have it → just toggle visibility.
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

  const label = loading ? "Summarizing…" : summary ? (open ? "Hide summary" : "Show summary") : "Summarize";

  return (
    <span className="summary-wrap">
      <button className="link-btn" onClick={onClick} disabled={loading}>
        {label}
      </button>
      {error && <p className="summary err">{error}</p>}
      {open && summary && <p className="summary">{summary}</p>}
    </span>
  );
}
