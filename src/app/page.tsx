import { getFeed, type FeedStory } from "@/lib/feed";
import PollButton from "./PollButton";

/**
 * Feed page (also a manual verification tool): lists stored stories newest-first
 * and offers a "Poll now" button. Phase 5 — each cluster is collapsed into one
 * story, with the other sources listed under it. Server component, no
 * personalization yet (that arrives in Phase 8).
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

/** "guardian-australia" -> "guardian australia" for nicer display. */
function label(source: string): string {
  return source.replace(/-/g, " ");
}

export default async function Home() {
  let stories: FeedStory[] = [];
  let error: string | null = null;

  try {
    stories = await getFeed();
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
        Latest stories across your sources, newest first. {stories.length} stor
        {stories.length === 1 ? "y" : "ies"} shown.
      </p>

      {error && (
        <p className="notice err">
          Couldn&apos;t load the feed: {error}
          <br />
          (Is <code>DATABASE_URL</code> set and migrated?)
        </p>
      )}

      {!error && stories.length === 0 && (
        <div className="empty">
          No stories yet. Hit <strong>Poll now</strong> to fetch the latest.
        </div>
      )}

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
    </main>
  );
}
