import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles } from "@/db/schema";

/**
 * Read stored articles newest-first. Shared by `GET /api/feed` and the feed
 * page (server component). No personalization yet — ranking by learned
 * interest arrives in Phase 7.
 */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export type FeedArticle = {
  id: number;
  source: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
};

export function clampLimit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

export async function getFeed(limit: number = DEFAULT_LIMIT): Promise<FeedArticle[]> {
  return db
    .select({
      id: articles.id,
      source: articles.source,
      title: articles.title,
      canonicalUrl: articles.canonicalUrl,
      summary: articles.summary,
      publishedAt: articles.publishedAt,
      fetchedAt: articles.fetchedAt,
    })
    .from(articles)
    // Newest published first; nulls last, then by fetch time as a tiebreaker.
    .orderBy(sql`${articles.publishedAt} DESC NULLS LAST`, desc(articles.fetchedAt))
    .limit(limit);
}
