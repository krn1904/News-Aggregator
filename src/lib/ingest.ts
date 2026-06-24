import { db } from "@/db";
import { articles } from "@/db/schema";
import { sources } from "@/lib/sources";
import { clusterUnclustered, type ClusterResult } from "@/lib/cluster";
import { tagUntagged, type TagResult } from "@/lib/tags";

/**
 * Core ingest logic, shared by `POST /api/poll` (secret-gated, for the cron) and
 * the UI "Poll now" server action. Runs every registered source, inserting only
 * new canonical URLs (ON CONFLICT DO NOTHING), then clusters (Phase 5) and tags
 * (Phase 6) the newly-stored articles. Resilient: one source failing is recorded
 * and the rest still run; clustering/tagging failures don't fail the poll.
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
  tagging: TagResult;
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

  // Tag anything not yet tagged (keyword + AI fallback). Also non-fatal.
  let tagging: TagResult = {
    considered: 0, keywordTagged: 0, aiQueued: 0, aiTagged: 0, aiCalls: 0, aiEnabled: false,
  };
  try {
    tagging = await tagUntagged();
  } catch {
    // swallow — untagged articles are retried next poll
  }

  return { totals, perSource, clustering, tagging };
}
