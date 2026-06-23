import type { Source } from "./types";
import { fetchHackerNews } from "./hackernews";
import { fetchRss, type FeedDef } from "./rss";

/**
 * The source registry — the single place that defines what gets ingested.
 * Add a news feed by adding one line to RSS_FEEDS; add a non-RSS source by
 * writing an adapter and appending it to `sources` below.
 *
 * Feeds chosen for: Australia + immigration, India news, India markets, and the
 * Australian IT/tech sector (job-market angle gets sharpened by Phase 5 tagging).
 * URLs are verified live at runtime (fetched from Vercel/Actions) — if a feed
 * 404s, the poll logs that source's error and continues with the rest.
 */
export const RSS_FEEDS: FeedDef[] = [
  // Australia + immigration
  { name: "guardian-australia", url: "https://www.theguardian.com/australia-news/rss" },
  { name: "guardian-migration", url: "https://www.theguardian.com/world/migration/rss" },
  // India news
  { name: "guardian-india", url: "https://www.theguardian.com/world/india/rss" },
  // India markets (heavy overlap → good clustering fodder in Phase 5)
  { name: "economictimes-markets", url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms" },
  { name: "livemint-markets", url: "https://www.livemint.com/rss/markets" },
  // Australian IT / tech sector (proxy for "IT job market in Australia")
  { name: "guardian-au-technology", url: "https://www.theguardian.com/au/technology/rss" },
];

export const sources: Source[] = [
  { name: "hackernews", fetch: fetchHackerNews },
  ...RSS_FEEDS.map((feed) => ({ name: feed.name, fetch: () => fetchRss(feed) })),
];
