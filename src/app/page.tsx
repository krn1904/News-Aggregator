import { getFeed, type FeedStory } from "@/lib/feed";
import Feed from "@/components/Feed/Feed";
import EmptyState from "@/components/EmptyState/EmptyState";
import { auth } from "../../auth";

/**
 * Feed page. Server-renders the first ranked page; the client <Feed> handles
 * voting, summaries, load-more, and refresh-after-poll. The Masthead + theme +
 * poll provider are in the root layout shell.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIRST_PAGE = 20;

export default async function Home() {
  let stories: FeedStory[] = [];
  let error: string | null = null;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  try {
    stories = await getFeed(userId, FIRST_PAGE, 0);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (error) {
    return (
      <p
        style={{
          padding: "48px 34px",
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          color: "var(--muted)",
        }}
      >
        Couldn’t load the feed: {error}
      </p>
    );
  }

  if (stories.length === 0) return <EmptyState />;

  return <Feed initial={stories} />;
}
