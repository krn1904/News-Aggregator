/**
 * Database schema — Phase 1.
 * Mirrors §10 of the design doc. The `body` / `detailSummary` /
 * `enrichmentStatus` columns are defined now but stay empty until the
 * Phase 8 enrichment step fills them for selected articles.
 */
import {
  pgTable,
  serial,
  integer,
  text,
  real,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

// A story can be carried by several sources; a cluster groups those duplicates.
export const clusters = pgTable("clusters", {
  clusterId: serial("cluster_id").primaryKey(),
  // Plain integer ref (no hard FK) to avoid a circular dependency with articles.
  representativeArticleId: integer("representative_article_id"),
  sourceCount: integer("source_count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    clusterId: integer("cluster_id").references(() => clusters.clusterId),

    // Identity / dedup
    canonicalUrl: text("canonical_url").notNull().unique(),
    contentHash: text("content_hash").notNull(), // idempotent re-ingest

    // Core fields
    source: text("source").notNull(),
    title: text("title").notNull(),
    summary: text("summary"), // Tier 1: ingest blurb (used for tagging/scoring)

    // Tier 2 enrichment (filled later, for selected articles only)
    body: text("body"),
    detailSummary: text("detail_summary"),
    enrichmentStatus: text("enrichment_status").notNull().default("raw"), // raw | enriched | failed

    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_articles_cluster").on(t.clusterId),
    index("idx_articles_published").on(t.publishedAt),
    index("idx_articles_enrichment").on(t.enrichmentStatus),
  ]
);

// Many topic tags per article (keyword-scoring output, Phase 5).
export const tags = pgTable(
  "tags",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    score: real("score").notNull(),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.topic] })]
);

// The learned profile: one interest score per topic (Phase 6).
export const topicInterest = pgTable("topic_interest", {
  topic: text("topic").primaryKey(),
  score: real("score").notNull().default(1), // start equal
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Thumbs up/down events that drive the learning loop (Phase 6).
export const votes = pgTable(
  "votes",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    value: integer("value").notNull(), // +1 or -1
    votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_votes_article").on(t.articleId)]
);
