import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles, votes } from "@/db/schema";

/**
 * Read the feed as a list of STORIES, not raw articles. Phase 5 clustering means
 * the same story can arrive from several sources; here we collapse each cluster
 * into one entry (the most recent member as the headline) and list the other
 * sources. Shared by `GET /api/feed` and the feed page. No personalization yet —
 * ranking by learned interest arrives in Phase 8.
 */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// Recent articles scanned before collapsing into stories. Clusters are time-tight
// (3-day match window), so a recency window this size captures whole clusters.
const COLLAPSE_WINDOW = 400;

export type FeedStory = {
  id: number; // representative article
  source: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  sourceCount: number; // total articles in the cluster (1 = unique)
  others: { source: string; url: string }[]; // the non-representative members
  userVote: number | null; // current vote on the representative article: 1 | -1 | null
};

export function clampLimit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

export async function getFeed(
  limit: number = DEFAULT_LIMIT,
  offset: number = 0
): Promise<FeedStory[]> {
  const rows = await db
    .select({
      id: articles.id,
      clusterId: articles.clusterId,
      source: articles.source,
      title: articles.title,
      canonicalUrl: articles.canonicalUrl,
      summary: articles.summary,
      publishedAt: articles.publishedAt,
      fetchedAt: articles.fetchedAt,
      userVote: votes.value, // ≤1 vote per article, so this leftJoin won't fan out
    })
    .from(articles)
    .leftJoin(votes, eq(votes.articleId, articles.id))
    .orderBy(sql`${articles.publishedAt} DESC NULLS LAST`, desc(articles.fetchedAt))
    .limit(COLLAPSE_WINDOW);

  type Row = (typeof rows)[number];
  const timeOf = (r: Row) => (r.publishedAt ?? r.fetchedAt).getTime();

  // Group by cluster; an unclustered article is its own singleton story.
  const groups = new Map<string, { rep: Row; latest: number; members: Row[] }>();
  for (const r of rows) {
    const key = r.clusterId != null ? `c${r.clusterId}` : `a${r.id}`;
    const t = timeOf(r);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { rep: r, latest: t, members: [r] });
    } else {
      g.members.push(r);
      if (t > g.latest) g.latest = t;
      if (t > timeOf(g.rep)) g.rep = r; // headline = most recent member
    }
  }

  // Order stories by each cluster's latest coverage, then take the page.
  return [...groups.values()]
    .sort((a, b) => b.latest - a.latest)
    .slice(offset, offset + limit)
    .map((g) => {
      // Distinct OUTLETS, most-recent url per outlet (members are recency-desc).
      const byOutlet = new Map<string, string>();
      for (const m of g.members) if (!byOutlet.has(m.source)) byOutlet.set(m.source, m.canonicalUrl);
      const others = [...byOutlet]
        .filter(([source]) => source !== g.rep.source)
        .map(([source, url]) => ({ source, url }));
      return {
        id: g.rep.id,
        source: g.rep.source,
        title: g.rep.title,
        canonicalUrl: g.rep.canonicalUrl,
        summary: g.rep.summary,
        publishedAt: g.rep.publishedAt,
        fetchedAt: g.rep.fetchedAt,
        sourceCount: byOutlet.size, // distinct outlets, not article count
        others,
        userVote: g.rep.userVote ?? null,
      };
    });
}
