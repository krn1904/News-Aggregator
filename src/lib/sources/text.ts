/**
 * Shared text cleanup for source adapters. Article blurbs arrive as HTML with
 * encoded entities (RSS descriptions, Hacker News `story_text`), so strip tags,
 * decode entities (named + decimal + hex), collapse whitespace, and cap length.
 */

function safeCodePoint(n: number): string {
  try {
    return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

/** Decode named + numeric (decimal & hex) HTML entities. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

/** Decode entities + strip any stray tags from a title (no length cap). */
export function cleanTitle(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Strip HTML tags, decode entities, collapse whitespace, cap at ~400 chars. */
export function toPlainSummary(html: string | null | undefined): string | null {
  if (!html) return null;
  const stripped = decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1") // tidy "word ." -> "word." left by tag stripping
    .trim();
  if (!stripped) return null;
  return stripped.length > 400 ? stripped.slice(0, 397) + "…" : stripped;
}
