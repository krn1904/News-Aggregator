import { db } from "@/db";
import { articles } from "@/db/schema";
import { sources } from "@/lib/sources";
import { clusterUnclustered, type ClusterResult } from "@/lib/cluster";

/**
 * Core ingest logic, shared by `POST /api/poll` (secret-gated, for the cron) and
 * the UI "Poll now" server action. Runs every registered source, inserting only
 * new canonical URLs (ON CONFLICT DO NOTHING), then clusters the newly-stored
 * articles (Phase 5). Resilient: one source failing is recorded and the rest
 * still run.
 */
export type SourceResult = {
  source: string;
  fetched: number;
  inserted: number;
  skipped: number;
  error?: string;
};

export type IngestResult = {
  totals: { fetched: number; inserted: number; skipped: number; sources: number; failed: number };
  perSource: SourceResult[];
  clustering: ClusterResult;
};

export async function ingestAllSources(): Promise<IngestResult> {
  const perSource: SourceResult[] = [];

  for (const source of sources) {
    try {
      const items = await source.fetch();
      const fetched = items.length;

      let inserted = 0;
      if (fetched > 0) {
        const rows = await db
          .insert(articles)
          .values(items)
          .onConflictDoNothing({ target: articles.canonicalUrl })
          .returning({ id: articles.id });
        inserted = rows.length;
      }

      perSource.push({ source: source.name, fetched, inserted, skipped: fetched - inserted });
    } catch (err) {
      perSource.push({
        source: source.name,
        fetched: 0,
        inserted: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totals = perSource.reduce(
    (acc, r) => ({
      fetched: acc.fetched + r.fetched,
      inserted: acc.inserted + r.inserted,
      skipped: acc.skipped + r.skipped,
      sources: acc.sources + 1,
      failed: acc.failed + (r.error ? 1 : 0),
    }),
    { fetched: 0, inserted: 0, skipped: 0, sources: 0, failed: 0 }
  );

  // Cluster anything not yet grouped (the just-inserted articles, plus any
  // backlog). Failure here shouldn't fail the whole poll.
  let clustering: ClusterResult = { clustersCreated: 0, clustersMatched: 0, considered: 0 };
  try {
    clustering = await clusterUnclustered();
  } catch {
    // swallow — ingestion already succeeded; clustering will retry next poll
  }

  return { totals, perSource, clustering };
}
