import type { ScoredTopic } from "./keyword";
import { canonicalize } from "./canonical";

/**
 * AI tagging via Google Gemini — the open-vocabulary half of Phase 6. Used only
 * for articles the keyword taxonomy didn't match. Each call is given the article
 * batch AND the current known-topic list, and is told to REUSE an existing topic
 * when it fits, else coin a new kebab-case one. That's what grows the vocabulary
 * toward new interests without it fragmenting into near-duplicates.
 *
 * Graceful by design: no API key, a network error, or a bad response all return
 * an empty result — the article simply stays untagged and is retried next poll.
 * Never throws.
 */

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

// Fixed confidence for AI-derived tags (keyword tags carry computed scores).
const AI_TAG_SCORE = 0.6;
const TIMEOUT_MS = 20_000;

export type AiInput = { id: number; title: string; summary: string | null };

/** Normalize a topic label to the shared kebab-case convention. */
function normTopic(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildPrompt(items: AiInput[], knownTopics: string[]): string {
  const known = knownTopics.length ? knownTopics.join(", ") : "(none yet)";
  const articles = items
    .map((a) => `- id ${a.id}: ${a.title}${a.summary ? ` — ${a.summary.slice(0, 240)}` : ""}`)
    .join("\n");
  return [
    "You are tagging news articles by topic for a personalized news app.",
    "Assign 1–3 topics to each article.",
    "ALWAYS reuse a topic from this existing list if one is even roughly applicable:",
    known,
    "Only invent a new topic when the subject is genuinely absent from the list.",
    "NEVER create a near-synonym of an existing topic — e.g. if 'culture' exists, do",
    "not output 'art' or 'art-and-culture'; if 'health' exists, do not output",
    "'public-health'. Prefer a single broad word.",
    "New topics must be lowercase kebab-case, 1–2 words, broad enough to recur",
    "(e.g. 'natural-disasters', not 'queensland-cyclone-2026').",
    "",
    "Articles:",
    articles,
  ].join("\n");
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          topics: { type: "array", items: { type: "string" } },
        },
        required: ["id", "topics"],
      },
    },
  },
  required: ["results"],
} as const;

/** Tag one batch of articles. Returns a map of articleId → scored topics. */
export async function aiTagArticles(
  items: AiInput[],
  knownTopics: string[]
): Promise<Map<number, ScoredTopic[]>> {
  const result = new Map<number, ScoredTopic[]>();
  const key = process.env.GEMINI_API_KEY;
  if (!key || items.length === 0) return result;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT(key), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(items, knownTopics) }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[ai-tags] Gemini HTTP ${res.status} ${res.statusText} ${body.slice(0, 300)}`);
      return result;
    }
    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("[ai-tags] Gemini returned no text", JSON.stringify(data).slice(0, 300));
      return result;
    }

    const parsed = JSON.parse(text) as { results?: { id: number; topics: string[] }[] };
    for (const row of parsed.results ?? []) {
      const seen = new Set<string>();
      const topics: ScoredTopic[] = [];
      for (const raw of row.topics ?? []) {
        const topic = canonicalize(normTopic(raw)); // collapse near-dup synonyms
        if (topic && !seen.has(topic)) {
          seen.add(topic);
          topics.push({ topic, score: AI_TAG_SCORE });
          if (topics.length === 3) break;
        }
      }
      if (topics.length) result.set(row.id, topics);
    }
  } catch (err) {
    console.error("[ai-tags] failed:", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
  return result;
}
