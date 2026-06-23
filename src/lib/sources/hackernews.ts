import { contentHash } from "@/lib/hash";
import type { NormalizedArticle } from "./types";

/**
 * One source adapter: Hacker News via the public Algolia API (no key needed).
 * Returns articles already normalized into the shape `articles` expects, so the
 * poll route stays source-agnostic — adding a second source later just means
 * adding another adapter that returns `NormalizedArticle[]`.
 */

export const SOURCE = "hackernews" as const;

type AlgoliaHit = {
  objectID: string;
  title: string | null;
  url: string | null; // null for Ask HN / text posts
  author: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string | null; // ISO 8601
  story_text: string | null;
};

type AlgoliaResponse = { hits: AlgoliaHit[] };

const ENDPOINT = "https://hn.algolia.com/api/v1/search?tags=front_page";

/** Fetch the HN front page and normalize it into NormalizedArticle[]. */
export async function fetchHackerNews(): Promise<NormalizedArticle[]> {
  const res = await fetch(ENDPOINT, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Hacker News fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as AlgoliaResponse;

  const normalized: NormalizedArticle[] = [];
  for (const hit of data.hits ?? []) {
    if (!hit.title) continue; // skip comment-only / malformed rows

    // Text posts (Ask/Show HN) have no external url → point at the HN thread.
    const canonicalUrl =
      hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`;

    // HN has no blurb; synthesize a lightweight Tier-1 summary for later scoring.
    const summary =
      hit.story_text?.trim() ||
      [
        hit.points != null ? `${hit.points} points` : null,
        hit.num_comments != null ? `${hit.num_comments} comments` : null,
        hit.author ? `by ${hit.author}` : null,
      ]
        .filter(Boolean)
        .join(" · ") ||
      null;

    const publishedAt = hit.created_at ? new Date(hit.created_at) : null;

    normalized.push({
      source: SOURCE,
      title: hit.title,
      canonicalUrl,
      summary,
      publishedAt: publishedAt && !isNaN(publishedAt.getTime()) ? publishedAt : null,
      contentHash: contentHash([canonicalUrl, hit.title, summary]),
    });
  }

  // De-dup within this batch (Postgres ON CONFLICT DO NOTHING does not
  // collapse duplicate keys inside a single INSERT statement).
  const seen = new Set<string>();
  return normalized.filter((a) =>
    seen.has(a.canonicalUrl) ? false : (seen.add(a.canonicalUrl), true)
  );
}
