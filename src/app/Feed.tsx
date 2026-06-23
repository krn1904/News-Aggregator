"use client";

import { useState } from "react";
import type { FeedStory } from "@/lib/feed";

const PAGE = 20;

function timeAgo(d: Date | string | null): string {
  if (!d) return "unknown time";
  const secs = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** "guardian-australia" -> "guardian australia" for nicer display. */
function label(source: string): string {
  return source.replace(/-/g, " ");
}

/**
 * Client feed list with "Load more" pagination. The first page is server-
 * rendered and handed in via `initial`; further pages are fetched from
 * /api/feed and appended until a short page signals the end.
 */
export default function Feed({ initial }: { initial: FeedStory[] }) {
  const [stories, setStories] = useState<FeedStory[]>(initial);
  const [offset, setOffset] = useState(initial.length);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?limit=${PAGE}&offset=${offset}`);
      const data = await res.json();
      const more: FeedStory[] = data.articles ?? [];
      setStories((s) => [...s, ...more]);
      setOffset((o) => o + more.length);
      if (more.length < PAGE) setHasMore(false);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ul className="list">
        {stories.map((s) => (
          <li key={s.id} className="item">
            <a className="title" href={s.canonicalUrl} target="_blank" rel="noopener noreferrer">
              {s.title}
            </a>
            <div className="meta">
              <span className="tag">{label(s.source)}</span>
              {s.sourceCount > 1 && <span className="tag sources">{s.sourceCount} sources</span>}
              {hostOf(s.canonicalUrl) && <span>{hostOf(s.canonicalUrl)}</span>}
              <span>{timeAgo(s.publishedAt)}</span>
            </div>
            {s.others.length > 0 && (
              <div className="also">
                Also covered by:{" "}
                {s.others.map((o, i) => (
                  <span key={o.url}>
                    {i > 0 && " · "}
                    <a href={o.url} target="_blank" rel="noopener noreferrer">
                      {label(o.source)}
                    </a>
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {hasMore && (
        <button className="btn more" onClick={loadMore} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}
