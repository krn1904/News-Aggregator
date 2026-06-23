/**
 * Shape every source adapter normalizes its items into — matches the columns
 * `POST /api/poll` writes to `articles`. Shared so the poll route stays
 * source-agnostic: adding a source = adding an adapter that returns these.
 */
export type NormalizedArticle = {
  source: string;
  title: string;
  canonicalUrl: string;
  summary: string | null;
  publishedAt: Date | null;
  contentHash: string;
};

/** A registered source: a label + a function that fetches & normalizes it. */
export type Source = {
  name: string;
  fetch: () => Promise<NormalizedArticle[]>;
};
