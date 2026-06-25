import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles, tags, topicInterest, votes } from "@/db/schema";

/**
 * Read the feed as a ranked list of STORIES. Phase 5 collapses clusters into one
 * story; Phase 8 ranks them by **personal interest × recency**, then re-orders
 * for **source diversity** so one chatty outlet can't dominate the top.
 *
 *   interestScore = Σ(tag.score × topic_interest[topic]) / Σ(tag.score)   (1 = neutral)
 *   recency       = 0.5 ^ (ageHours / HALF_LIFE_HOURS)
 *   baseScore     = interestScore × recency
 *
 * With no votes every topic_interest is 1, so interestScore = 1 and the order is
 * pure recency (+ diversity) — i.e. it degrades gracefully to the old behaviour.
 */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

const COLLAPSE_WINDOW = 400; // recent articles scanned before collapsing/ranking
const HALF_LIFE_HOURS = 48; // recency half-life (balanced: loved topics stay up ~a day)
const DIVERSITY_DECAY = 0.7; // score multiplier per already-shown story from the same outlet

export type FeedStory = {
  id: number; // representative article
  source: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  sourceCount: number; // distinct outlets in the cluster (1 = unique)
  others: { source: string; url: string }[];
  userVote: number | null; // 1 | -1 | null
  score: number; // interestScore × recency (1 ≈ neutral & fresh)
  detailSummary: string | null; // cached AI summary (Phase 9), null until enriched
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
      userVote: votes.value,
      detailSummary: articles.detailSummary,
    })
    .from(articles)
    .leftJoin(votes, eq(votes.articleId, articles.id))
    .orderBy(sql`${articles.publishedAt} DESC NULLS LAST`, desc(articles.fetchedAt))
    .limit(COLLAPSE_WINDOW);

  type Row = (typeof rows)[number];
  const timeOf = (r: Row) => (r.publishedAt ?? r.fetchedAt).getTime();

  // Collapse into stories (one per cluster; unclustered = singleton).
  const groups = new Map<string, { rep: Row; latest: number; members: Row[] }>();
  for (const r of rows) {
    const key = r.clusterId != null ? `c${r.clusterId}` : `a${r.id}`;
    const t = timeOf(r);
    const g = groups.get(key);
    if (!g) groups.set(key, { rep: r, latest: t, members: [r] });
    else {
      g.members.push(r);
      if (t > g.latest) g.latest = t;
      if (t > timeOf(g.rep)) g.rep = r; // headline = most recent member
    }
  }
  const stories = [...groups.values()];

  // Pull the rep articles' tags + the interest profile to score them.
  const repIds = stories.map((s) => s.rep.id);
  const tagRows = repIds.length
    ? await db
        .select({ articleId: tags.articleId, topic: tags.topic, score: tags.score })
        .from(tags)
        .where(inArray(tags.articleId, repIds))
    : [];
  const tagsByArticle = new Map<number, { topic: string; score: number }[]>();
  for (const t of tagRows) {
    const list = tagsByArticle.get(t.articleId) ?? [];
    list.push({ topic: t.topic, score: t.score });
    tagsByArticle.set(t.articleId, list);
  }
  const interestRows = await db
    .select({ topic: topicInterest.topic, score: topicInterest.score })
    .from(topicInterest);
  const interest = new Map(interestRows.map((r) => [r.topic, r.score]));

  const now = Date.now();
  const scored = stories.map((g) => {
    const ts = tagsByArticle.get(g.rep.id) ?? [];
    let num = 0;
    let den = 0;
    for (const { topic, score } of ts) {
      num += score * (interest.get(topic) ?? 1);
      den += score;
    }
    const interestScore = den > 0 ? num / den : 1; // 1 = neutral / untagged
    const ageHours = Math.max(0, (now - g.latest) / 3_600_000);
    const recency = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
    return { g, base: interestScore * recency };
  });

  // Greedy source-diversity re-rank: repeatedly take the highest score, but
  // discount a story by DIVERSITY_DECAY^(# already-shown from its outlet).
  const ranked: typeof scored = [];
  const shownFromSource = new Map<string, number>();
  const remaining = scored.slice();
  while (remaining.length) {
    let bestIdx = 0;
    let bestEff = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const r = remaining[i];
      const penalty = Math.pow(DIVERSITY_DECAY, shownFromSource.get(r.g.rep.source) ?? 0);
      const eff = r.base * penalty;
      if (eff > bestEff) {
        bestEff = eff;
        bestIdx = i;
      }
    }
    const [picked] = remaining.splice(bestIdx, 1);
    ranked.push(picked);
    shownFromSource.set(picked.g.rep.source, (shownFromSource.get(picked.g.rep.source) ?? 0) + 1);
  }

  return ranked.slice(offset, offset + limit).map(({ g, base }) => {
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
      sourceCount: byOutlet.size,
      others,
      userVote: g.rep.userVote ?? null,
      score: Number(base.toFixed(3)),
      detailSummary: g.rep.detailSummary ?? null,
    };
  });
}
