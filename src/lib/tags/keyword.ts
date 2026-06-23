import { TAXONOMY } from "./taxonomy";

/**
 * Keyword tagging: match an article's title + summary against the seed taxonomy
 * and return scored topics. Title hits count double (the headline is the
 * strongest signal). Deterministic, instant, free — handles the common case so
 * the AI layer only runs on what's left.
 */

export type ScoredTopic = { topic: string; score: number };

// Precompile one word-boundary regex per keyword, once at module load.
const COMPILED: { topic: string; res: RegExp[] }[] = Object.entries(TAXONOMY).map(
  ([topic, keywords]) => ({
    topic,
    res: keywords.map((k) => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // \b doesn't work before/after non-word chars (e.g. "s&p"), so guard with
      // a non-letter lookaround instead — matches the phrase as a standalone token.
      return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i");
    }),
  })
);

const TITLE_WEIGHT = 2;
const SUMMARY_WEIGHT = 1;
// Raw weighted-hit count that maps to score 1.0 (clamped).
const SCORE_NORM = 4;
// Minimum raw score for a topic to be kept.
const MIN_RAW = 2;

/** Returns scored topics for one article, sorted high→low. Empty = no match. */
export function keywordTags(title: string, summary: string | null): ScoredTopic[] {
  const t = title.toLowerCase();
  const s = (summary ?? "").toLowerCase();

  const out: ScoredTopic[] = [];
  for (const { topic, res } of COMPILED) {
    let titleHits = 0;
    let summaryHits = 0;
    for (const re of res) {
      if (re.test(t)) titleHits++;
      else if (re.test(s)) summaryHits++;
    }
    const raw = TITLE_WEIGHT * titleHits + SUMMARY_WEIGHT * summaryHits;
    if (raw >= MIN_RAW) {
      out.push({ topic, score: Math.min(1, raw / SCORE_NORM) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
