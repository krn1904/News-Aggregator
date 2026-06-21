CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"cluster_id" integer,
	"canonical_url" text NOT NULL,
	"content_hash" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text,
	"detail_summary" text,
	"enrichment_status" text DEFAULT 'raw' NOT NULL,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_canonical_url_unique" UNIQUE("canonical_url")
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"cluster_id" serial PRIMARY KEY NOT NULL,
	"representative_article_id" integer,
	"source_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"article_id" integer NOT NULL,
	"topic" text NOT NULL,
	"score" real NOT NULL,
	CONSTRAINT "tags_article_id_topic_pk" PRIMARY KEY("article_id","topic")
);
--> statement-breakpoint
CREATE TABLE "topic_interest" (
	"topic" text PRIMARY KEY NOT NULL,
	"score" real DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"article_id" integer NOT NULL,
	"value" integer NOT NULL,
	"voted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_cluster_id_clusters_cluster_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("cluster_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_articles_cluster" ON "articles" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "idx_articles_published" ON "articles" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "idx_articles_enrichment" ON "articles" USING btree ("enrichment_status");--> statement-breakpoint
CREATE INDEX "idx_votes_article" ON "votes" USING btree ("article_id");