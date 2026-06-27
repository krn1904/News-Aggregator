import { eq } from "drizzle-orm";
import { db } from "@/db";
import { articles } from "@/db/schema";

/**
 * Phase 9 — on-demand enrichment. Generates a short AI summary of an article,
 * only when the user asks (a button), and caches it so a second open is free.
 *
 * Two steps, decoupled for reliability:
 *   1. Jina Reader (https://r.jina.ai/<url>) fetches clean, LLM-ready article
 *      text — handles the messy HTML/JS fetching that Gemini's url_context tool
 *      was failing at, even on open pages.
 *   2. The plain Gemini `generateContent` call (same one tagging uses) summarizes
 *      that text. No browser tools, so nothing flaky.
 *
 * Graceful: missing key, an unreadable page, or any error returns a "failed"
 * result with a `reason` — the UI then just shows the link. Never throws a crash.
 */
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const READER_TIMEOUT_MS = 25_000;
const GEMINI_TIMEOUT_MS = 25_000;
const MAX_TEXT_CHARS = 12_000; // ~3–4k tokens; plenty for a summary, caps cost

export type EnrichResult = {
  articleId: number;
  status: "enriched" | "failed";
  detailSummary: string | null;
  reason?: string;
};

export async function enrichArticle(articleId: number): Promise<EnrichResult> {
  const [art] = await db
    .select({
      id: articles.id,
      canonicalUrl: articles.canonicalUrl,
      detailSummary: articles.detailSummary,
      enrichmentStatus: articles.enrichmentStatus,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!art) return { articleId, status: "failed", detailSummary: null, reason: "not-found" };

  // Already done → return the cached summary, no new work.
  if (art.enrichmentStatus === "enriched" && art.detailSummary) {
    return { articleId, status: "enriched", detailSummary: art.detailSummary };
  }

  if (!process.env.GEMINI_API_KEY) {
    return { articleId, status: "failed", detailSummary: null, reason: "no-api-key" };
  }

  const { summary, reason } = await summarize(art.canonicalUrl);

  if (!summary) {
    await db.update(articles).set({ enrichmentStatus: "failed" }).where(eq(articles.id, articleId));
    console.warn(`[enrich] article ${articleId} failed: ${reason} (${art.canonicalUrl})`);
    return { articleId, status: "failed", detailSummary: null, reason };
  }

  await db
    .update(articles)
    .set({ detailSummary: summary, enrichmentStatus: "enriched" })
    .where(eq(articles.id, articleId));
  return { articleId, status: "enriched", detailSummary: summary };
}

async function summarize(url: string): Promise<{ summary: string | null; reason: string }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { summary: null, reason: "no-api-key" };

  const article = await fetchReadable(url);
  if (!article.text) return { summary: null, reason: article.reason };

  return summarizeText(article.text, key);
}

/** Fetch clean article text via Jina Reader (free; LLM-friendly markdown). */
async function fetchReadable(url: string): Promise<{ text: string | null; reason: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READER_TIMEOUT_MS);
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { accept: "text/plain", "x-return-format": "text" },
      signal: controller.signal,
    });
    if (!res.ok) return { text: null, reason: `reader-http-${res.status}` };
    const body = (await res.text()).trim();
    if (!body) return { text: null, reason: "reader-empty" };
    return { text: body.slice(0, MAX_TEXT_CHARS), reason: "ok" };
  } catch (err) {
    return { text: null, reason: `reader-exception: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

/** Summarize already-fetched text with a plain Gemini call (no tools). */
async function summarizeText(text: string, key: string): Promise<{ summary: string | null; reason: string }> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const prompt =
    "Summarize the following news article in 3–4 short, factual sentences for a reader " +
    "deciding whether to open it. No preamble, no markdown, no bullet points.\n\nARTICLE:\n" +
    text;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { summary: null, reason: `gemini-http-${res.status}: ${body.slice(0, 200)}` };
    }
    const data = await res.json();
    const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const out = parts.map((p) => p.text ?? "").join(" ").trim();
    if (!out) return { summary: null, reason: "gemini-empty" };
    return { summary: out, reason: "ok" };
  } catch (err) {
    return { summary: null, reason: `gemini-exception: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}
