import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles, clusters } from "@/db/schema";

/**
 * Phase 5 — clustering. Groups the "same story" carried by different sources
 * into one cluster, using title-token similarity within a time window.
 *
 * Runs at the end of each poll, over articles that don't yet have a cluster.
 * Idempotent: already-clustered articles are left alone, so re-running is safe.
 * Title similarity is a heuristic — tune the constants below as you see results.
 */

// Only consider articles from the last week (bounds work; same story = recent).
const RECENCY_DAYS = 7;
// Two articles can only be the same story if published within this gap.
const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
// Jaccard similarity on title tokens needed to call it a match.
const JACCARD_THRESHOLD = 0.45;
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

/** Jaccard similarity between two token sets + the raw intersection size. */
export function jaccard(a: Set<string>, b: Set<string>): { score: number; shared: number } {
  if (a.size === 0 || b.size === 0) return { score: 0, shared: 0 };
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const union = a.size + b.size - shared;
  return { score: union === 0 ? 0 : shared / union, shared };
}

export type ClusterResult = {
  clustersCreated: number;
  clustersMatched: number; // articles attached to an existing/earlier cluster
  considered: number;
};

const timeOf = (publishedAt: Date | null, fetchedAt: Date) =>
  (publishedAt ?? fetchedAt).getTime();

type Rep = { clusterId: number; tokens: Set<string>; time: number };

export async function clusterUnclustered(): Promise<ClusterResult> {
  const since = new Date(Date.now() - RECENCY_DAYS * 24 * 60 * 60 * 1000);

  // Representatives of existing clusters (within the window) to match against.
  const existing = await db
    .select({
      clusterId: clusters.clusterId,
      title: articles.title,
      publishedAt: articles.publishedAt,
      fetchedAt: articles.fetchedAt,
    })
    .from(clusters)
    .innerJoin(articles, eq(articles.id, clusters.representativeArticleId))
    .where(gte(sql`COALESCE(${articles.publishedAt}, ${articles.fetchedAt})`, since));

  const reps: Rep[] = existing.map((r) => ({
    clusterId: r.clusterId,
    tokens: tokenize(r.title),
    time: timeOf(r.publishedAt, r.fetchedAt),
  }));

  // Articles with no cluster yet, oldest first (so the earliest becomes the rep).
  const todo = await db
    .select({
      id: articles.id,
      title: articles.title,
      publishedAt: articles.publishedAt,
      fetchedAt: articles.fetchedAt,
    })
    .from(articles)
    .where(
      and(isNull(articles.clusterId), gte(sql`COALESCE(${articles.publishedAt}, ${articles.fetchedAt})`, since))
    )
    .orderBy(sql`COALESCE(${articles.publishedAt}, ${articles.fetchedAt}) ASC`);

  let clustersCreated = 0;
  let clustersMatched = 0;

  for (const art of todo) {
    const tokens = tokenize(art.title);
    const t = timeOf(art.publishedAt, art.fetchedAt);

    let best: { rep: Rep; score: number } | null = null;
    for (const rep of reps) {
      if (Math.abs(rep.time - t) > MATCH_WINDOW_MS) continue;
      const { score, shared } = jaccard(tokens, rep.tokens);
      if (score >= JACCARD_THRESHOLD && shared >= MIN_SHARED_TOKENS) {
        if (!best || score > best.score) best = { rep, score };
      }
    }

    if (best) {
      await db.update(articles).set({ clusterId: best.rep.clusterId }).where(eq(articles.id, art.id));
      await db
        .update(clusters)
        .set({ sourceCount: sql`${clusters.sourceCount} + 1` })
        .where(eq(clusters.clusterId, best.rep.clusterId));
      clustersMatched++;
    } else {
      const [created] = await db
        .insert(clusters)
        .values({ representativeArticleId: art.id, sourceCount: 1 })
        .returning({ clusterId: clusters.clusterId });
      await db.update(articles).set({ clusterId: created.clusterId }).where(eq(articles.id, art.id));
      // Make it matchable by later articles in this same pass.
      reps.push({ clusterId: created.clusterId, tokens, time: t });
      clustersCreated++;
    }
  }

  return { clustersCreated, clustersMatched, considered: todo.length };
}
