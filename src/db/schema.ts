/**
 * Database schema.
 *
 * Shared news content (`articles`, `clusters`, `tags`) is global and ingested
 * once for everyone. Phase 11 scopes the per-person state (`votes` and
 * `topic_interest`) by Auth.js user so ranking and learning become multi-user.
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
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Auth.js adapter tables. Credentials users store a password hash; OAuth-only
// users leave it null.
export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  passwordHash: text("password_hash"),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("idx_accounts_user").on(t.userId),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [index("idx_sessions_user").on(t.userId)]
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
);

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

// The learned profile: one interest score per topic per user.
export const topicInterest = pgTable(
  "topic_interest",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    score: real("score").notNull().default(1), // start equal
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topic] })]
);

// Thumbs up/down events that drive the learning loop, one vote per user/article.
export const votes = pgTable(
  "votes",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    value: integer("value").notNull(), // +1 or -1
    votedAt: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_votes_article").on(t.articleId),
    index("idx_votes_user").on(t.userId),
    uniqueIndex("uidx_votes_user_article").on(t.userId, t.articleId),
  ]
);
