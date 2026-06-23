import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles, tags } from "@/db/schema";
import { keywordTags } from "./keyword";
import { aiTagArticles, type AiInput } from "./ai";
import { SEED_TOPICS } from "./taxonomy";

/**
 * Phase 6 tagging orchestrator. Runs at the end of each poll over articles that
 * have no tags yet (idempotent). Keyword taxonomy tags the common case for free;
 * anything it can't match goes to the AI layer (capped + batched per run to stay
 * inside free-tier limits). Writes tag rows with ON CONFLICT DO NOTHING.
 */

const TAG_RECENCY_DAYS = 14;
const MAX_SCAN = 300; // untagged articles processed per run (keyword tags all)
const MAX_AI_ARTICLES = 48; // cap AI work per run; the rest is retried next poll
const AI_BATCH = 12; // articles per Gemini call

export type TagResult = {
  considered: number; // untagged articles seen
  keywordTagged: number; // tagged by the seed taxonomy
  aiQueued: number; // matched nothing → needed AI
  aiTagged: number; // AI actually tagged
  aiCalls: number; // Gemini requests made
};

export async function tagUntagged(): Promise<TagResult> {
  const since = new Date(Date.now() - TAG_RECENCY_DAYS * 24 * 60 * 60 * 1000);
  const recent = sql`COALESCE(${articles.publishedAt}, ${articles.fetchedAt})`;

  // Untagged articles (left join → no tag row), newest first.
  const untagged = await db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
    })
    .from(articles)
    .leftJoin(tags, eq(tags.articleId, articles.id))
    .where(and(gte(recent, since), isNull(tags.articleId)))
    .orderBy(sql`${recent} DESC`)
    .limit(MAX_SCAN);

  if (untagged.length === 0) {
    return { considered: 0, keywordTagged: 0, aiQueued: 0, aiTagged: 0, aiCalls: 0 };
  }

  const rows: { articleId: number; topic: string; score: number }[] = [];
  const aiQueue: AiInput[] = [];
  let keywordTagged = 0;

  for (const art of untagged) {
    const kw = keywordTags(art.title, art.summary);
    if (kw.length > 0) {
      for (const { topic, score } of kw) rows.push({ articleId: art.id, topic, score });
      keywordTagged++;
    } else {
      aiQueue.push({ id: art.id, title: art.title, summary: art.summary });
    }
  }

  let aiTagged = 0;
  let aiCalls = 0;
  // Only touch the AI path if a key is configured (otherwise it's keyword-only).
  if (process.env.GEMINI_API_KEY && aiQueue.length > 0) {
    // Known vocabulary for the AI prompt = seeds + every topic already in the DB.
    const distinct = await db.selectDistinct({ topic: tags.topic }).from(tags);
    const knownTopics = [...new Set([...SEED_TOPICS, ...distinct.map((d) => d.topic)])];

    const aiSlice = aiQueue.slice(0, MAX_AI_ARTICLES);
    for (let i = 0; i < aiSlice.length; i += AI_BATCH) {
      const batch = aiSlice.slice(i, i + AI_BATCH);
      const map = await aiTagArticles(batch, knownTopics);
      aiCalls++;
      for (const [id, topics] of map) {
        for (const { topic, score } of topics) rows.push({ articleId: id, topic, score });
        aiTagged++;
      }
    }
  }

  if (rows.length > 0) {
    await db.insert(tags).values(rows).onConflictDoNothing();
  }

  return {
    considered: untagged.length,
    keywordTagged,
    aiQueued: aiQueue.length,
    aiTagged,
    aiCalls,
  };
}
