import { getFeed, type FeedStory } from "@/lib/feed";
import PollButton from "./PollButton";
import Feed from "./Feed";

/**
 * Feed page (also a manual verification tool): collapsed stories newest-first
 * with a "Poll now" button and "Load more" pagination. Server component fetches
 * the first page; the client `Feed` handles appending more. No personalization
 * yet (that arrives in Phase 8).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIRST_PAGE = 20;

export default async function Home() {
  let stories: FeedStory[] = [];
  let error: string | null = null;

  try {
    stories = await getFeed(FIRST_PAGE, 0);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="wrap">
      <div className="header">
        <h1>News Aggregator</h1>
        <PollButton />
      </div>
      <p className="sub">Latest stories across your sources, newest first.</p>

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

      {stories.length > 0 && <Feed initial={stories} />}
    </main>
  );
}
