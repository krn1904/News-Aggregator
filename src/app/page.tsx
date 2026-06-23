import { getFeed, type FeedArticle } from "@/lib/feed";
import PollButton from "./PollButton";

/**
 * Phase 2 feed page (also serves as a manual verification tool): lists stored
 * articles newest-first and offers a "Poll now" button to ingest the HN front
 * page. Read straight from the DB (server component) — no personalization yet.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timeAgo(d: Date | null): string {
  if (!d) return "unknown time";
  const secs = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default async function Home() {
  let articles: FeedArticle[] = [];
  let error: string | null = null;

  try {
    articles = await getFeed();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="wrap">
      <div className="header">
        <h1>News Aggregator</h1>
        <PollButton />
      </div>
      <p className="sub">
        Phase 2 — Hacker News front page, newest first. {articles.length} article
        {articles.length === 1 ? "" : "s"} stored.
      </p>

      {error && (
        <p className="notice err">
          Couldn&apos;t load the feed: {error}
          <br />
          (Is <code>DATABASE_URL</code> set and migrated?)
        </p>
      )}

      {!error && articles.length === 0 && (
        <div className="empty">
          No articles yet. Hit <strong>Poll now</strong> to fetch the Hacker News front page.
        </div>
      )}

      <ul className="list">
        {articles.map((a) => (
          <li key={a.id} className="item">
            <a className="title" href={a.canonicalUrl} target="_blank" rel="noopener noreferrer">
              {a.title}
            </a>
            <div className="meta">
              <span className="tag">{a.source}</span>
              {hostOf(a.canonicalUrl) && <span>{hostOf(a.canonicalUrl)}</span>}
              <span>{timeAgo(a.publishedAt)}</span>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
