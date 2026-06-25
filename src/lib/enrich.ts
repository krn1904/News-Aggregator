import { eq } from "drizzle-orm";
import { db } from "@/db";
import { articles } from "@/db/schema";

/**
 * Phase 9 — on-demand enrichment. Generates a short AI summary of an article,
 * only when the user asks (a button), and caches it so a second open is free.
 *
 * Uses Gemini's URL-context tool: we hand Gemini the article URL and it fetches
 * + reads the page itself, then summarizes. Paywalled/blocked pages can't be
 * read → we mark `enrichmentStatus = 'failed'` and the UI just shows the link.
 * Graceful: no key / error never throws to the caller as a crash — it returns
 * a failed result.
 */
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const TIMEOUT_MS = 30_000;

export type EnrichResult = {
  articleId: number;
  status: "enriched" | "failed";
  detailSummary: string | null;
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

  if (!art) return { articleId, status: "failed", detailSummary: null };

  // Already done → return the cached summary, no new AI call.
  if (art.enrichmentStatus === "enriched" && art.detailSummary) {
    return { articleId, status: "enriched", detailSummary: art.detailSummary };
  }

  if (!process.env.GEMINI_API_KEY) {
    return { articleId, status: "failed", detailSummary: null };
  }

  const summary = await summarizeUrl(art.canonicalUrl);

  if (!summary) {
    await db
      .update(articles)
      .set({ enrichmentStatus: "failed" })
      .where(eq(articles.id, articleId));
    return { articleId, status: "failed", detailSummary: null };
  }

  await db
    .update(articles)
    .set({ detailSummary: summary, enrichmentStatus: "enriched" })
    .where(eq(articles.id, articleId));

  return { articleId, status: "enriched", detailSummary: summary };
}

/** Ask Gemini (with the URL-context tool) to summarize the page at `url`. */
async function summarizeUrl(url: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const prompt =
    "Summarize the news article at the following URL in 3–4 short, factual sentences " +
    "for a reader deciding whether to open it. No preamble, no markdown, no bullet points.\n\n" +
    url;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ url_context: {} }], // lets Gemini fetch + read the URL itself
        generationConfig: { temperature: 0.3 },
      }),
    });

    if (!res.ok) {
      console.error(`[enrich] Gemini HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .map((p) => p.text ?? "")
      .join(" ")
      .trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    console.error("[enrich] failed:", err instanceof Error ? err.message : String(err));
    return null;
  } finally {
    clearTimeout(timer);
  }
}
