# News Aggregator

Personalized, multi-source, self-learning news app.
Stack: **Next.js (TypeScript)** · **Neon** (serverless Postgres) · **Drizzle ORM** · Vercel + GitHub Actions.

This repo is at **Phase 2 — Ingest + feed**. News is now fetched from Hacker News,
stored in Neon, read back over an API, and shown in a basic UI. See
[`documents/ROADMAP.md`](documents/ROADMAP.md) for the full phase plan and progress.

## What's in the app so far
**Phase 1 — Data layer**
- `src/db/schema.ts` — all 5 tables (articles, clusters, tags, topic_interest, votes), matching the design doc §10.
- `src/db/index.ts` — Neon HTTP client (serverless-safe, no connection-pool exhaustion).
- `drizzle/0000_phase1_init.sql` — generated migration.
- `src/app/api/health` — liveness probe (no DB).
- `src/app/api/db-check` — proves the app can read+write Neon.

**Phase 2 — Ingest + feed**
- `POST /api/poll` — fetches the Hacker News front page (Algolia), normalizes, dedups on
  `canonical_url`, and stores new articles. Idempotent. Auth: `Authorization: Bearer <POLL_SECRET>`.
- `GET /api/feed` — returns stored articles newest-first (`?limit`, default 20, max 100).
- `src/lib/sources/hackernews.ts` — source adapter; `src/lib/ingest.ts` / `src/lib/feed.ts` — shared logic.
- `src/app/page.tsx` — basic feed UI with a **Poll now** button (server action; the secret stays server-side).

## One-time setup (your part)
1. **Create a free Neon project** at neon.tech → open *Connection Details* → copy the **Pooled** connection string.
2. `cp .env.example .env.local` and paste it as `DATABASE_URL`. Set a long random `POLL_SECRET`.
3. Install + create the tables:
   ```bash
   npm install
   npm run db:migrate     # applies drizzle/0000_phase1_init.sql to Neon
   ```

## Verify
```bash
npm run dev
# Phase 1 — data layer:
curl localhost:3000/api/health     # -> { ok: true, ... }
curl localhost:3000/api/db-check   # -> { ok: true, roundTrip: { topic: "__db_check__", ... } }

# Phase 2 — ingest + feed:
curl -X POST localhost:3000/api/poll -H "Authorization: Bearer $POLL_SECRET"  # -> { fetched, inserted, skipped }
curl localhost:3000/api/feed        # -> { ok: true, count, articles: [...] }
```
Run the poll twice — the second run should report `inserted: 0` (dedup works).
Or just open `http://localhost:3000` and click **Poll now**.

## Useful scripts
| command | does |
|---|---|
| `npm run dev` | local dev server |
| `npm run db:generate` | regenerate migration after editing the schema |
| `npm run db:migrate` | apply migrations to Neon |
| `npm run typecheck` | `tsc --noEmit` |

## Scheduled polling (Phase 3)
`.github/workflows/poll.yml` calls the deployed `POST /api/poll` daily (06:00 UTC) and on
manual dispatch, so articles accumulate automatically. One-time setup in GitHub → Settings →
Secrets and variables → Actions: add `APP_URL` (Vercel URL, no trailing slash) and `POLL_SECRET`
(same as the Vercel env var). The schedule activates once the workflow is on `main`.

## Next: Phase 4 — Clustering
Group the same story carried by multiple sources into one cluster (`representative_article_id`,
`source_count`), and backfill `articles.cluster_id`.
