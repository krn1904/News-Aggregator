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
| 3     | Scheduled polling (GitHub Actions cron)         | ✅ done |
| 4     | Multi-source ingestion (RSS news feeds)         | ✅ done |
| 5     | Clustering (dedup same story across sources)    | ✅ done |
| 6     | Tagging — keyword seeds + AI growing vocab      | ✅ done |
| 7     | Voting → `topic_interest` learning loop         | ⬜      |
| 8     | Personalized ranking in `/api/feed`             | ⬜      |
| 9     | On-demand enrichment (`body` / `detailSummary`) | ⬜      |
| 10    | Frontend UI                                     | ⬜      |


> Phase 4 (multi-source) was inserted ahead of clustering — clustering only does meaningful work once ≥2 sources exist. Later phases renumbered accordingly.

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

## Phase 3 — Scheduled polling ✅ (DONE)

- [x] GitHub Actions workflow on a cron — `.github/workflows/poll.yml` (daily 06:00 UTC + manual `workflow_dispatch`)
- [x] Calls hosted `/api/poll` with `POLL_SECRET` (reads `APP_URL` + `POLL_SECRET` repo secrets; fails on non-2xx)
- [ ] Confirm articles accumulate automatically over time (verify after merge to `main` + first scheduled run)

**Setup required (one-time, in GitHub):** Settings → Secrets and variables → Actions → add
`APP_URL` (Vercel URL, no trailing slash) and `POLL_SECRET` (same value as the Vercel env var).
The `schedule:` trigger only fires once the workflow is on the **default branch (`main`)**.

---

## Phase 4 — Multi-source ingestion ✅ (DONE)

Add real news sources beyond Hacker News so clustering (Phase 5) has duplicates to merge.

- [x] Generic RSS/Atom adapter — `src/lib/sources/rss.ts` (HTML-stripped summaries, robust link/date handling, in-batch dedup)
- [x] Source registry — `src/lib/sources/index.ts`; each feed is one `{ name, url }` line
- [x] `ingestAllSources()` loops every source resiliently (one feed failing doesn't abort the rest); per-source + total counts
- [x] `POST /api/poll` + "Poll now" report per-source results and failures
- [x] `fast-xml-parser` dependency added

**Feeds wired (topic-targeted):** Australia + immigration (Guardian australia-news, world/migration), India news (Guardian india), India markets (Economic Times markets, Livemint markets), Australian IT/tech (Guardian au/technology). Job-market angle gets sharpened by Phase 6 tagging. Feed URLs verified live at runtime; broken feeds are logged and skipped.

---

## Phase 5 — Clustering ✅ (DONE)

Group the same story carried by multiple sources into one `cluster`.

- [x] `src/lib/cluster.ts` — cross-outlet title-token overlap (normalize + stopwords) within a time window; never merges two articles from the same outlet (kills templated-headline false merges)
- [x] Create/extend a `clusters` row, set `representativeArticleId`, bump `sourceCount`
- [x] Backfill `articles.clusterId` (idempotent: only touches unclustered articles)
- [x] Runs at the end of each poll (`ingestAllSources`); poll JSON + "Poll now" report grouped counts
- [x] Feed collapses each cluster into one story (most-recent headline, ordered by latest coverage) with an "also covered by" source list + "N sources" badge

**Tunables** (in `cluster.ts`): `OVERLAP_THRESHOLD` 0.5, `MIN_SHARED_TOKENS` 2, `MATCH_WINDOW_MS` 3 days, `RECENCY_DAYS` 7. "N sources" in the feed counts distinct **outlets**, not articles. Limitation: token matching misses synonyms (e.g. "RBI" vs "Reserve Bank of India") — semantic/embedding matching is a future upgrade if needed. The feed collapses each cluster into one story with the other sources listed beneath ("also covered by"); a fully expandable card (each version's own summary/preview) stays for Phase 10.

---

## Phase 6 — Tagging (keyword seeds + AI growing vocabulary) ✅ (DONE)

Tag each article with topics so the vote loop (Phase 7) and ranking (Phase 8) have signal.
Runs in the write path after insert, idempotent (only tags articles with no tags yet).
Tags table is `(articleId, topic, score)`, PK `(articleId, topic)` — append-only; topic strings
are a shared, **growing** vocabulary (free text, so new topics are first-class with no schema change).

**Two-tier engine (decided with Krn):**
- [x] **Seed taxonomy** (`src/lib/tags/taxonomy.ts` + `keyword.ts`) — broad buckets + interest topics,
      each a keyword list; word-boundary matched against `title` (weighted ×2) + `summary`. Free, instant.
- [x] **AI fallback** (`src/lib/tags/ai.ts`, Gemini) — only for articles the keywords didn't match;
      batched (12/call), passed the article + current distinct-tag list, reuses or coins a kebab tag.
      Graceful: no key / error → article stays untagged, retried next poll. Never throws.
- [x] **Orchestrator** (`src/lib/tags/index.ts` `tagUntagged()`) — keyword-first, AI for the rest
      (capped 48/run), inserts `tags` rows `(articleId, topic, score)` with ON CONFLICT DO NOTHING.
- [x] Wired into `ingestAllSources()` after clustering (non-fatal); poll JSON + "Poll now" report counts.
- [x] `GEMINI_API_KEY` documented in `.env.example` (set in `.env.local` + Vercel; not GitHub).

**Why AI is core here, not optional:** a fixed taxonomy caps what the app can ever learn — a story
outside the seed list stays untagged, so up/down-votes on it do nothing. The AI is the engine that
expands the vocabulary so personalization isn't ceilinged.

**Cost / free-tier design:** AI only on unmatched articles, **batched** (one call tags many) to stay
under requests-per-minute limits; whole thing fits a free tier (e.g. Gemini 2.5 Flash ~1,500/day).
Pass the tag list each call + normalize (lowercase/kebab) to avoid vocabulary drift (`climate` vs
`climate-change`). Graceful failure: if the AI call fails, leave untagged and retry next poll.
Needs a free LLM API key as a secret (like `POLL_SECRET`).

**Model notes (provider-neutral):** topic extraction → Gemini 2.5 Flash/Flash-Lite or Groq Llama 3.3 70B
(small/fast is enough). Don't strip stopwords for the AI path — give it natural text; stopword
removal is only for the keyword path.

**Verified live (2026-06-24):** AI confirmed firing (Gemini dashboard usage); coined new topics like
`weather`, `aviation`, `transportation`, `privacy`, `history`. Diagnostics added: `aiEnabled` flag in
the poll JSON + `[tags]` server logs. **Known drift observed** — near-dup topics (`art`/`art-and-culture`/
`culture`, `health`/`public-health`); fix deferred to Phase 7 canonicalization (see below).
Gotcha learned: env vars (`GEMINI_API_KEY`) bake in at build time — the deployment must be **redeployed**
after adding/scoping the key, per Preview/Production scope.

---

## Phase 7 — Voting → learning loop ⬜ (NEXT)

- [ ] `POST /api/vote` records +1 / -1 into `votes`
- [ ] Update `topic_interest.score` per topic from votes (weighted by `tags.score`)
- [ ] Seed `topic_interest` (all start equal at 1)
- [ ] **Tag-vocabulary canonicalization** (folded in here — this is where drift first
      costs us): (a) tighten the AI prompt in `src/lib/tags/ai.ts` to bias harder toward
      reusing an existing tag; (b) alias/merge map + one-time cleanup of existing near-dup
      topics (`art-and-culture → art`, `public-health → health`, …), minding the tags PK
      `(article_id, topic)` so a merge doesn't create duplicate rows. (Observed in Phase 6.)

---

## Phase 8 — Personalized ranking ⬜

- [ ] `/api/feed` ranks articles by `tags.score` × `topic_interest.score`
- [ ] Recency weighting / decay

---

## Phase 9 — On-demand enrichment (AI summaries) ⬜

- [ ] On article open (button), fetch full `body`, generate `detailSummary` via LLM
- [ ] Set `enrichmentStatus`: `raw` → `enriched` (or `failed`)
- [ ] Only enrich on demand (cost control) — otherwise just show the source link

**Reading the article (decided with Krn):** LLMs don't fetch URLs by default. Two free routes —
Gemini **URL Context** tool (pass the URL, Gemini reads it) or **Jina Reader** (`https://r.jina.ai/<url>`
→ clean text → any model). Paywalled articles can't be read → fall back to showing the link only.
Reuses the same LLM API key as Phase 6.

---

## Phase 10 — Frontend UI 🔵

- [x] Feed view consuming `/api/feed` (basic version shipped in Phase 2)
- [ ] Thumbs up/down wired to `/api/vote` (needs Phase 7)
- [ ] Article detail view triggering enrichment (needs Phase 9)
- [ ] Styling/polish pass

---

*Last updated: 2026-06-24 — Phase 6 complete (keyword seeds + Gemini AI growing-vocabulary tagging in the write path; needs GEMINI_API_KEY for the AI half, keyword-only without it). Next: Phase 7 voting → topic_interest learning loop.*