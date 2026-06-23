import { and, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles, clusters } from "@/db/schema";

/**
 * Phase 5 — clustering. Groups the "same story" carried by DIFFERENT outlets
 * into one cluster, using title-token overlap within a time window.
 *
 * Cross-outlet only: an article never joins a cluster that already contains its
 * own source. (Same-outlet near-duplicates are usually just templated headlines
 * — "Sensex today…", "Stocks to buy…" — not the same story; exact same-URL dupes
 * are already handled by the unique canonical_url.) This keeps a cluster to at
 * most one article per outlet, so its size == the number of distinct outlets.
 *
 * Runs at the end of each poll over articles with no cluster yet. Idempotent.
 */

// Only consider articles from the last week (bounds work; same story = recent).
const RECENCY_DAYS = 7;
// Two articles can only be the same story if published within this gap.
const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
// Title-overlap similarity needed to call two headlines the same story.
const OVERLAP_THRESHOLD = 0.5;
// ...and at least this many shared meaningful tokens (guards tiny titles).
const MIN_SHARED_TOKENS = 2;

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
  "it", "its", "this", "that", "these", "those", "his", "her", "their", "our",
  "you", "your", "we", "they", "he", "she", "has", "have", "had", "will",
  "would", "can", "could", "should", "may", "might", "new", "says", "say",
  "after", "over", "amid", "into", "out", "up", "down", "how", "why", "what",
  "who", "when", "where", "than", "then", "now", "more", "most", "not",
]);

/** Normalize a title into a set of meaningful lowercase tokens. */
export function tokenize(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(tokens);
}

/**
 * Overlap coefficient: shared / size of the smaller title. More forgiving than
 * Jaccard when one headline is longer than the other (the common cross-outlet
 * case), and safe to use now that same-outlet matches are excluded.
 */
export function titleSimilarity(a: Set<string>, b: Set<string>): { score: number; shared: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: 0 };
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return { score: shared / Math.min(a.size, b.size), shared };
}

export type ClusterResult = {
  clustersCreated: number;
  clustersMatched: number; // articles attached to an existing/earlier cluster
  considered: number;
};

const timeOf = (publishedAt: Date | null, fetchedAt: Date) =>
  (publishedAt ?? fetchedAt).getTime();

type Rep = { clusterId: number; tokens: Set<string>; time: number; sources: Set<string> };

export async function clusterUnclustered(): Promise<ClusterResult> {
  const since = new Date(Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000);
  const recent = sql`COALESCE(${articles.publishedAt}, ${articles.fetchedAt})`;

  // Representative (title/time) of each existing cluster within the window.
  const repRows = await db
    .select({
      clusterId: clusters.clusterId,
      title: articles.title,
      publishedAt: articles.publishedAt,
      fetchedAt: articles.fetchedAt,
    })
    .from(clusters)
    .innerJoin(articles, eq(articles.id, clusters.representativeArticleId))
    .where(gte(recent, since));

  // Which outlets each existing cluster already contains (to enforce one-per-outlet).
  const memberRows = await db
    .select({ clusterId: articles.clusterId, source: articles.source })
    .from(articles)
    .where(and(isNotNull(articles.clusterId), gte(recent, since)));

  const sourcesByCluster = new Map<number, Set<string>>();
  for (const m of memberRows) {
    if (m.clusterId == null) continue;
    const set = sourcesByCluster.get(m.clusterId) ?? new Set<string>();
    set.add(m.source);
    sourcesByCluster.set(m.clusterId, set);
  }

  const reps: Rep[] = repRows.map((r) => ({
    clusterId: r.clusterId,
    tokens: tokenize(r.title),
    time: timeOf(r.publishedAt, r.fetchedAt),
    sources: sourcesByCluster.get(r.clusterId) ?? new Set<string>(),
  }));

  // Articles with no cluster yet, oldest first (so the earliest becomes the rep).
  const todo = await db
    .select({
      id: articles.id,
      source: articles.source,
      title: articles.title,
      publishedAt: articles.publishedAt,
      fetchedAt: articles.fetchedAt,
    })
    .from(articles)
    .where(and(isNull(articles.clusterId), gte(recent, since)))
    .orderBy(sql`COALESCE(${articles.publishedAt}, ${articles.fetchedAt}) ASC`);

  let clustersCreated = 0;
  let clustersMatched = 0;

  for (const art of todo) {
    const tokens = tokenize(art.title);
    const t = timeOf(art.publishedAt, art.fetchedAt);

    let best: { rep: Rep; score: number } | null = null;
    for (const rep of reps) {
      if (Math.abs(rep.time - t) > MATCH_WINDOW_MS) continue;
      if (rep.sources.has(art.source)) continue; // cross-outlet only, one per outlet
      const { score, shared } = titleSimilarity(tokens, rep.tokens);
      if (score >= OVERLAP_THRESHOLD && shared >= MIN_SHARED_TOKENS) {
        if (!best || score > best.score) best = { rep, score };
      }
    }

    if (best) {
      await db.update(articles).set({ clusterId: best.rep.clusterId }).where(eq(articles.id, art.id));
      await db
        .update(clusters)
        .set({ sourceCount: sql`${clusters.sourceCount} + 1` })
        .where(eq(clusters.clusterId, best.rep.clusterId));
      best.rep.sources.add(art.source);
      clustersMatched++;
    } else {
      const [created] = await db
        .insert(clusters)
        .values({ representativeArticleId: art.id, sourceCount: 1 })
        .returning({ clusterId: clusters.clusterId });
      await db.update(articles).set({ clusterId: created.clusterId }).where(eq(articles.id, art.id));
      reps.push({ clusterId: created.clusterId, tokens, time: t, sources: new Set([art.source]) });
      clustersCreated++;
    }
  }

  return { clustersCreated, clustersMatched, considered: todo.length };
}
