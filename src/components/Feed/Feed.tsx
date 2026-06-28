"use client";

import { useEffect, useState } from "react";
import type { FeedStory } from "@/lib/feed";
import StoryCard from "@/components/StoryCard/StoryCard";
import Skeleton from "@/components/states/Skeleton";
import { usePoll } from "@/components/PollProvider/PollProvider";
import styles from "./Feed.module.css";

const PAGE = 20;

/**
 * Client feed: server-rendered first page in `initial`, "Load more" appends from
 * /api/feed. While a poll runs (shared via PollProvider) it shows skeletons; when
 * the poll finishes, the server page refreshes and the new `initial` re-syncs.
 */
export default function Feed({ initial }: { initial: FeedStory[] }) {
  const { polling, result } = usePoll();
  const [stories, setStories] = useState<FeedStory[]>(initial);
  const [offset, setOffset] = useState(initial.length);
  const [hasMore, setHasMore] = useState(initial.length >= PAGE);
  const [loadingMore, setLoadingMore] = useState(false);

  // A poll refresh (router.refresh) re-renders the server page with a fresh
  // first page — re-sync the client list to it.
  useEffect(() => {
    setStories(initial);
    setOffset(initial.length);
    setHasMore(initial.length >= PAGE);
  }, [initial]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
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
      setLoadingMore(false);
    }
  }

  return (
    <>
      {polling && (
        <div className={styles.polling}>
          <div className={styles.bar} />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {result && !polling && (
        <p className={styles.result}>
          Fetched {result.fetched} · {result.inserted} new · {result.tagged} tagged
          {result.failed > 0 ? ` · ${result.failed} source${result.failed === 1 ? "" : "s"} failed` : ""}
        </p>
      )}

      <div>
        {stories.map((s) => (
          <StoryCard key={s.id} story={s} />
        ))}
      </div>

      {hasMore && (
        <button className={styles.more} onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}
