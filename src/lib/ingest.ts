import { db } from "@/db";
import { articles } from "@/db/schema";
import { fetchHackerNews } from "@/lib/sources/hackernews";

/**
 * Core ingest logic, shared by the public `POST /api/poll` route (secret-gated,
 * for the scheduled poller) and the UI's "Poll now" server action (trusted,
 * server-side). Keeping it here means both paths behave identically.
 */
export type IngestResult = {
  source: string;
  fetched: number;
  inserted: number;
  skipped: number;
};

export async function ingestHackerNews(): Promise<IngestResult> {
  const items = await fetchHackerNews();
  const fetched = items.length;

  if (fetched === 0) {
    return { source: "hackernews", fetched: 0, inserted: 0, skipped: 0 };
  }

  // Only new canonical URLs land; existing ones are silently skipped.
  const insertedRows = await db
    .insert(articles)
    .values(items)
    .onConflictDoNothing({ target: articles.canonicalUrl })
    .returning({ id: articles.id });

  const inserted = insertedRows.length;
  return { source: "hackernews", fetched, inserted, skipped: fetched - inserted };
}
