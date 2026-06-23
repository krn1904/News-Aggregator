# News Aggregator — Roadmap & Progress Tracker

> Personalized, multi-source, self-learning news app.
> **Stack:** Next.js (TypeScript) · Neon (serverless Postgres) · Drizzle ORM · Vercel + GitHub Actions.

Single source of truth for *what's built* and *what's next*. Tick items as we finish them.
Phases are reconstructed from the schema comments in `src/db/schema.ts` (the original design-doc §10 is not in this repo).

**Legend:** ✅ done · 🔵 in progress · ⬜ not started

---

## Status at a glance


| Phase | Theme                                           | Status |
| ----- | ----------------------------------------------- | ------ |
| 1     | Data layer                                      | ✅ done |
| 2     | Ingest + feed (`/api/poll`, `/api/feed`) + basic UI | ✅ done |
| 3     | Scheduled polling (GitHub Actions cron)         | ⬜ next |
| 4     | Clustering (dedup same story across sources)    | ⬜      |
| 5     | Keyword scoring → `tags`                        | ⬜      |
| 6     | Voting → `topic_interest` learning loop         | ⬜      |
| 7     | Personalized ranking in `/api/feed`             | ⬜      |
| 8     | On-demand enrichment (`body` / `detailSummary`) | ⬜      |
| 9     | Frontend UI                                     | ⬜      |


> Phases 3, 4, 7, 9 are implied by the schema + README but were not numbered in the source notes — included here so nothing falls through the cracks. Renumber freely.

---

## Hosting / setup checklist (pre-Phase-2)

- [x] Neon project created
- [x] Pooled `DATABASE_URL` in `.env.local`
- [x] `POLL_SECRET` set (long random string)
- [x] `npm install` + `npm run db:migrate` run (5 tables exist)
- [x] `curl localhost:3000/api/db-check` → `ok: true`
- [ ] Deployed to Vercel with env vars set
- [ ] Hosted `/api/db-check` → `ok: true`

---

## Phase 1 — Data layer ✅

- [x] `src/db/schema.ts` — 5 tables: `articles`, `clusters`, `tags`, `topic_interest`, `votes`
- [x] `src/db/index.ts` — Neon HTTP client (serverless-safe)
- [x] `drizzle/0000_phase1_init.sql` — generated migration
- [x] `GET /api/health` — liveness probe (no DB)
- [x] `GET /api/db-check` — read+write round-trip against Neon
- [x] Pushed to GitHub

**Schema columns and which phase fills them**


| Table          | Column                                                                    | Filled in |
| -------------- | ------------------------------------------------------------------------- | --------- |
| articles       | source, title, canonicalUrl, contentHash, summary, publishedAt, fetchedAt | Phase 2   |
| articles       | clusterId                                                                 | Phase 4   |
| articles       | body, detailSummary, enrichmentStatus                                     | Phase 8   |
| clusters       | (all)                                                                     | Phase 4   |
| tags           | (all)                                                                     | Phase 5   |
| votes          | (all)                                                                     | Phase 6   |
| topic_interest | (all)                                                                     | Phase 6   |


---

## Phase 2 — Ingest + feed ✅ (DONE)

Goal: get real articles flowing in from one source and back out as JSON. No learning yet.

`**POST /api/poll` — ingest job**

- [x] Auth-gate with `POLL_SECRET` (Bearer header)
- [x] Fetch Hacker News via Algolia API (`https://hn.algolia.com/api/v1/search?tags=front_page`)
- [x] Normalize each item → `source`, `title`, `canonicalUrl`, `summary`, `publishedAt`
- [x] Compute `contentHash` for idempotent re-ingest
- [x] Insert with `onConflictDoNothing` on `canonicalUrl` (dedup)
- [x] Leave `enrichmentStatus = "raw"`, `body`/`detailSummary` empty
- [x] Return counts (`fetched`, `inserted`, `skipped`)

`**GET /api/feed` — read back**

- [x] Query `articles` ordered by `publishedAt DESC` (nulls last, then `fetchedAt`)
- [x] Return JSON (no personalization yet); `?limit` (default 20, max 100)

**Basic UI** (built early; rest of the frontend is Phase 9)

- [x] `src/app/page.tsx` — feed list (newest-first) with empty/error states
- [x] **Poll now** button via server action (`POLL_SECRET` stays server-side)
- [x] Shared logic extracted to `src/lib/ingest.ts` + `src/lib/feed.ts`

**Acceptance**

- [x] `POST /api/poll` returns insert count
- [x] Running poll twice inserts 0 the second time (dedup works)
- [x] `GET /api/feed` lists stored articles

**Decision made:** HN-only first (adapter pattern in `src/lib/sources/` so a second source is easy later).

---

## Phase 3 — Scheduled polling ⬜

- [ ] GitHub Actions workflow on a cron
- [ ] Calls hosted `/api/poll` with `POLL_SECRET`
- [ ] Confirm articles accumulate automatically over time

---

## Phase 4 — Clustering ⬜

Group the same story carried by multiple sources into one `cluster`.

- [ ] Detect near-duplicate titles/URLs across sources
- [ ] Create/extend a `clusters` row, set `representativeArticleId`, bump `sourceCount`
- [ ] Backfill `articles.clusterId`

---

## Phase 5 — Keyword scoring → tags ⬜

- [ ] Extract topics from `title` + `summary`
- [ ] Write `tags` rows (`articleId`, `topic`, `score`)

---

## Phase 6 — Voting → learning loop ⬜

- [ ] `POST /api/vote` records +1 / -1 into `votes`
- [ ] Update `topic_interest.score` per topic from votes
- [ ] Seed `topic_interest` (all start equal at 1)

---

## Phase 7 — Personalized ranking ⬜

- [ ] `/api/feed` ranks articles by `tags.score` × `topic_interest.score`
- [ ] Recency weighting / decay

---

## Phase 8 — On-demand enrichment ⬜

- [ ] On article open, fetch full `body`, generate `detailSummary`
- [ ] Set `enrichmentStatus`: `raw` → `enriched` (or `failed`)
- [ ] Only enrich selected articles (cost control)

---

## Phase 9 — Frontend UI 🔵

- [x] Feed view consuming `/api/feed` (basic version shipped in Phase 2)
- [ ] Thumbs up/down wired to `/api/vote` (needs Phase 6)
- [ ] Article detail view triggering enrichment (needs Phase 8)
- [ ] Styling/polish pass

---

*Last updated: 2026-06-23 — Phase 2 complete (ingest + feed + basic UI, verified working locally). Next: Phase 3 scheduled polling.*