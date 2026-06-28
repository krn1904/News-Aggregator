import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { tags, topicInterest, votes } from "@/db/schema";

/**
 * Phase 11 — per-user learning loop. A user's vote on an article nudges that
 * user's interest score for each of the article's topics, weighted by how
 * strongly the article matches that topic (`tags.score`). One vote per
 * user/article with toggle semantics: voting the same way again clears it; the
 * opposite way flips it. The interest delta always reverses the previous vote
 * cleanly, so re-voting can't double-count.
 *
 * `topic_interest.score` starts at 1 (neutral); votes move it within a clamp.
 */
const LEARNING_RATE = 0.2;
const MIN_SCORE = 0.1;
const MAX_SCORE = 5;

export type VoteResult = { articleId: number; value: number }; // 1 | -1 | 0 (cleared)

export async function castVote(
  userId: string,
  articleId: number,
  value: 1 | -1
): Promise<VoteResult> {
  const [existing] = await db
    .select({ value: votes.value })
    .from(votes)
    .where(and(eq(votes.userId, userId), eq(votes.articleId, articleId)))
    .limit(1);

  const oldValue = existing?.value ?? 0;
  // Toggle: same direction again → clear; otherwise set to the new direction.
  const newValue = oldValue === value ? 0 : value;
  const delta = newValue - oldValue;

  if (delta !== 0) {
    const articleTags = await db
      .select({ topic: tags.topic, score: tags.score })
      .from(tags)
      .where(eq(tags.articleId, articleId));

    for (const { topic, score } of articleTags) {
      const adj = LEARNING_RATE * delta * score;
      await db
        .insert(topicInterest)
        .values({ userId, topic, score: clamp(1 + adj) }) // first touch seeds from neutral 1
        .onConflictDoUpdate({
          target: [topicInterest.userId, topicInterest.topic],
          set: {
            score: sql`GREATEST(${MIN_SCORE}, LEAST(${MAX_SCORE}, ${topicInterest.score} + ${adj}))`,
            updatedAt: sql`now()`,
          },
        });
    }
  }

  // Persist one vote per user/article (delete + re-insert; cleared = just delete).
  await db.delete(votes).where(and(eq(votes.userId, userId), eq(votes.articleId, articleId)));
  if (newValue !== 0) {
    await db.insert(votes).values({ userId, articleId, value: newValue });
  }

  return { articleId, value: newValue };
}

function clamp(n: number): number {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, n));
}
