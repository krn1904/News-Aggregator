/**
 * Article shapes shared across the source layer.
 *
 * Adapters return RAW articles (whatever the source gave us). The central
 * ingest step then normalizes EVERY article — strips HTML/decodes entities from
 * title + summary and computes the contentHash — so no individual adapter can
 * leak raw markup into the DB, now or in future. Adapters stay "dumb": fetch,
 * map to these fields, de-dup within their own batch.
 */

/** What an adapter produces — raw text fields, no contentHash yet. */
export type RawArticle = {
  source: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: Date | null;
};

/** The normalized, ready-to-store shape (raw + cleaned + hashed by ingest). */
export type NormalizedArticle = RawArticle & {
  contentHash: string;
};

/** A registered source: a label + a function that fetches raw articles. */
export type Source = {
  name: string;
  fetch: () => Promise<RawArticle[]>;
};
