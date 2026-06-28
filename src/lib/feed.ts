import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles, tags, topicInterest, votes } from "@/db/schema";

/**
 * Builds the ranked feed. Pipeline (all read-only — clustering/tagging/voting
 * already happened at poll time):
 *
 *   recent articles → collapse clusters into stories → score each story
 *   (your interest × freshness) → re-order for source diversity → take one page
 *
 * With no votes, every interest is neutral (1), so it's just freshness +
 * diversity — i.e. it degrades gracefully to "newest first".
 */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// --- tuning knobs ---
const COLLAPSE_WINDOW = 400; // how many recent articles we rank over
const HALF_LIFE_HOURS = 48; // a story's freshness halves every 48h
const DIVERSITY_DECAY = 0.7; // score multiplier per repeat from the same outlet

export type FeedStory = {
  id: number; // representative article
  source: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  sourceCount: number; // distinct outlets covering this story (1 = unique)
  others: { source: string; url: string }[]; // the other outlets + their links
  userVote: number | null; // 1 | -1 | null
  score: number; // interest × freshness (1 ≈ neutral & fresh)
  detailSummary: string | null; // cached AI summary, null until enriched
  topics: string[]; // the headline article's topics (for #tag chips)
};

export function clampLimit(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

// One recent article, with the user's vote joined on.
type ArticleRow = {
  id: number;
  clusterId: number | null;
  source: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: Date | null;
  fetchedAt: Date;
  userVote: number | null;
  detailSummary: string | null;
};

// A cluster of articles collapsed into a single story.
type Story = { rep: ArticleRow; latestMs: number; members: ArticleRow[] };
type ScoredStory = { story: Story; score: number; topics: string[] };

/** When the story happened — published time, or fetch time if unknown. */
const timeMs = (a: ArticleRow): number => (a.publishedAt ?? a.fetchedAt).getTime();

export async function getFeed(
  limit: number = DEFAULT_LIMIT,
  offset: number = 0
): Promise<FeedStory[]> {
  const recent = await fetchRecentArticles();
  const stories = collapseIntoStories(recent);
  const scored = await scoreStories(stories);
  const ranked = orderByInterestAndDiversity(scored);
  return ranked.slice(offset, offset + limit).map(toFeedStory);
}

/** Step 1 — the most recent articles, each with the current user's vote. */
async function fetchRecentArticles(): Promise<ArticleRow[]> {
  return db
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
      detailSummary: articles.detailSummary,
    })
    .from(articles)
    .leftJoin(votes, eq(votes.articleId, articles.id))
    .orderBy(sql`${articles.publishedAt} DESC NULLS LAST`, desc(articles.fetchedAt))
    .limit(COLLAPSE_WINDOW);
}

/**
 * Step 2 — group articles by their cluster into one story each (an unclustered
 * article is its own story). The headline is the cluster's most recent article.
 */
function collapseIntoStories(rows: ArticleRow[]): Story[] {
  const byCluster = new Map<string, Story>();

  for (const row of rows) {
    const key = row.clusterId != null ? `cluster:${row.clusterId}` : `article:${row.id}`;
    const story = byCluster.get(key);

    if (!story) {
      byCluster.set(key, { rep: row, latestMs: timeMs(row), members: [row] });
      continue;
    }
    story.members.push(row);
    story.latestMs = Math.max(story.latestMs, timeMs(row));
    if (timeMs(row) > timeMs(story.rep)) story.rep = row; // keep the freshest as headline
  }

  return [...byCluster.values()];
}

/** Step 3 — score every story: how much you like its topics × how fresh it is. */
async function scoreStories(stories: Story[]): Promise<ScoredStory[]> {
  const tagsByArticle = await loadTags(stories.map((s) => s.rep.id));
  const interest = await loadInterest();
  const now = Date.now();

  return stories.map((story) => {
    const storyTags = tagsByArticle.get(story.rep.id) ?? [];
    const topicMatch = interestScore(storyTags, interest);
    const ageHours = Math.max(0, (now - story.latestMs) / 3_600_000);
    const freshness = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
    // topics shown as #tags, strongest first
    const topics = [...storyTags].sort((a, b) => b.score - a.score).map((t) => t.topic);
    return { story, score: topicMatch * freshness, topics };
  });
}

/**
 * How much the reader likes a story's topics: a tag-strength-weighted average of
 * their interest scores. Returns 1 (neutral) when untagged or topics are unseen.
 */
function interestScore(
  storyTags: { topic: string; score: number }[],
  interest: Map<string, number>
): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const { topic, score } of storyTags) {
    weighted += score * (interest.get(topic) ?? 1); // unseen topic = neutral 1
    totalWeight += score;
  }
  return totalWeight > 0 ? weighted / totalWeight : 1;
}

/**
 * Step 4 — re-order so one outlet can't dominate. Repeatedly take the best
 * remaining story, but discount stories from outlets already placed
 * (DIVERSITY_DECAY^timesShown). We pick one at a time because each choice changes
 * the next round's penalties — a plain sort can't express that.
 */
function orderByInterestAndDiversity(scored: ScoredStory[]): ScoredStory[] {
  const remaining = [...scored];
  const ranked: ScoredStory[] = [];
  const timesShown = new Map<string, number>(); // outlet → how many already placed

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestEffective = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const outlet = remaining[i].story.rep.source;
      const penalty = Math.pow(DIVERSITY_DECAY, timesShown.get(outlet) ?? 0);
      const effective = remaining[i].score * penalty;
      if (effective > bestEffective) {
        bestEffective = effective;
        bestIndex = i;
      }
    }

    const [winner] = remaining.splice(bestIndex, 1);
    ranked.push(winner);
    const outlet = winner.story.rep.source;
    timesShown.set(outlet, (timesShown.get(outlet) ?? 0) + 1);
  }

  return ranked;
}

/** Step 5 — shape one ranked story into the object the UI consumes. */
function toFeedStory({ story, score, topics }: ScoredStory): FeedStory {
  const rep = story.rep;

  // One (most-recent) link per distinct outlet, minus the headline's own outlet.
  const urlByOutlet = new Map<string, string>();
  for (const m of story.members) {
    if (!urlByOutlet.has(m.source)) urlByOutlet.set(m.source, m.canonicalUrl);
  }
  const others = [...urlByOutlet]
    .filter(([outlet]) => outlet !== rep.source)
    .map(([source, url]) => ({ source, url }));

  return {
    id: rep.id,
    source: rep.source,
    title: rep.title,
    canonicalUrl: rep.canonicalUrl,
    summary: rep.summary,
    publishedAt: rep.publishedAt,
    fetchedAt: rep.fetchedAt,
    sourceCount: urlByOutlet.size,
    others,
    userVote: rep.userVote ?? null,
    score: Number(score.toFixed(3)), // the interest×freshness value (not the diversity-adjusted one)
    detailSummary: rep.detailSummary ?? null,
    topics,
  };
}

/** Load each article's tags, grouped by article id. */
async function loadTags(
  articleIds: number[]
): Promise<Map<number, { topic: string; score: number }[]>> {
  const byArticle = new Map<number, { topic: string; score: number }[]>();
  if (articleIds.length === 0) return byArticle;

  const rows = await db
    .select({ articleId: tags.articleId, topic: tags.topic, score: tags.score })
    .from(tags)
    .where(inArray(tags.articleId, articleIds));

  for (const r of rows) {
    const list = byArticle.get(r.articleId) ?? [];
    list.push({ topic: r.topic, score: r.score });
    byArticle.set(r.articleId, list);
  }
  return byArticle;
}

/** Load the reader's interest profile as topic → score. */
async function loadInterest(): Promise<Map<string, number>> {
  const rows = await db
    .select({ topic: topicInterest.topic, score: topicInterest.score })
    .from(topicInterest);
  return new Map(rows.map((r) => [r.topic, r.score]));
}
