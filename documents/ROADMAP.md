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
| 2     | Ingest + feed (`/api/poll`, `/api/feed`)        | ⬜ next |
| 3     | Scheduled polling (GitHub Actions cron)         | ⬜      |
| 4     | Clustering (dedup same story across sources)    | ⬜      |
| 5     | Keyword scoring → `tags`                        | ⬜      |
| 6     | Voting → `topic_interest` learning loop         | ⬜      |
| 7     | Personalized ranking in `/api/feed`             | ⬜      |
| 8     | On-demand enrichment (`body` / `detailSummary`) | ⬜      |
| 9     | Frontend UI                                     | ⬜      |


> Phases 3, 4, 7, 9 are implied by the schema + README but were not numbered in the source notes — included here so nothing falls through the cracks. Renumber freely.

---

## Hosting / setup checklist (pre-Phase-2)

- [ ] Neon project created
- [ ] Pooled `DATABASE_URL` in `.env.local`
- [ ] `POLL_SECRET` set (long random string)
- [ ] `npm install` + `npm run db:migrate` run (5 tables exist)
- [ ] `curl localhost:3000/api/db-check` → `ok: true`
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

## Phase 2 — Ingest + feed ⬜ (NEXT)

Goal: get real articles flowing in from one source and back out as JSON. No learning yet.

`**POST /api/poll` — ingest job**

- [ ] Auth-gate with `POLL_SECRET` (Bearer header)
- [ ] Fetch Hacker News via Algolia API (`https://hn.algolia.com/api/v1/search?tags=front_page`)
- [ ] Normalize each item → `source`, `title`, `canonicalUrl`, `summary`, `publishedAt`
- [ ] Compute `contentHash` for idempotent re-ingest
- [ ] Insert with `onConflictDoNothing` on `canonicalUrl` (dedup)
- [ ] Leave `enrichmentStatus = "raw"`, `body`/`detailSummary` empty
- [ ] Return count of inserted rows

`**GET /api/feed` — read back**

- [ ] Query `articles` ordered by `publishedAt DESC`
- [ ] Return JSON (no personalization yet)

**Acceptance**

- [ ] `POST /api/poll` returns insert count
- [ ] Running poll twice inserts 0 the second time (dedup works)
- [ ] `GET /api/feed` lists stored articles

**Open decision:** HN-only first (recommended), vs. `?source=` param now for easy multi-source later.

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

## Phase 9 — Frontend UI ⬜

- [ ] Feed view consuming `/api/feed`
- [ ] Thumbs up/down wired to `/api/vote`
- [ ] Article detail view triggering enrichment

---

*Last updated: 2026-06-21 — Phase 1 complete, hosting in progress, Phase 2 next.*