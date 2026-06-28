# News Aggregator — Roadmap & Progress Tracker

> Personalized, multi-source, self-learning news app.
> **Stack:** Next.js (TypeScript) · Neon (serverless Postgres) · Drizzle ORM · Vercel + GitHub Actions.

Single source of truth for *what's built* and *what's next*. Tick items as we finish them.
Phases are reconstructed from the schema comments in `src/db/schema.ts` (the original design-doc §10 is not in this repo).

**Legend:** ✅ done · 🔵 in progress · ⬜ not started

---

## Status at a glance


| Phase | Theme                                               | Status |
| ----- | --------------------------------------------------- | ------ |
| 1     | Data layer                                          | ✅ done |
| 2     | Ingest + feed (`/api/poll`, `/api/feed`) + basic UI | ✅ done |
| 3     | Scheduled polling (GitHub Actions cron)             | ✅ done |
| 4     | Multi-source ingestion (RSS news feeds)             | ✅ done |
| 5     | Clustering (dedup same story across sources)        | ✅ done |
| 6     | Tagging — keyword seeds + AI growing vocab          | ✅ done |
| 7     | Voting → `topic_interest` learning loop             | ✅ done |
| 8     | Personalized ranking in `/api/feed`                 | ✅ done |
| 9     | On-demand enrichment (AI summaries)                 | ✅ done |
| 10    | Frontend UI — "Dispatch" broadsheet design          | ✅ done |
| 11    | Auth + multi-user personalization                   | ✅ done |


> Phase 4 (multi-source) was inserted ahead of clustering — clustering only does meaningful work once ≥2 sources exist. Later phases renumbered accordingly.

---



## Hosting / setup checklist (pre-Phase-2)

- [x] Neon project created
- [x] Pooled `DATABASE_URL` in `.env.local`
- [x] `POLL_SECRET` set (long random string)
- [x] `npm install` + `npm run db:migrate` run (5 tables exist)
- [x] `curl localhost:3000/api/db-check` → `ok: true`
- [x] Deployed to Vercel with env vars set
- [x] Hosted `/api/db-check` → `ok: true`

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
The `schedule:` trigger only fires once the workflow is on the **default branch (**`main`**)**.

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
  ```
  each a keyword list; word-boundary matched against `title` (weighted ×2) + `summary`. Free, instant.
  ```
- [x] **AI fallback** (`src/lib/tags/ai.ts`, Gemini) — only for articles the keywords didn't match;
  ```
  batched (12/call), passed the article + current distinct-tag list, reuses or coins a kebab tag.
  Graceful: no key / error → article stays untagged, retried next poll. Never throws.
  ```
- [x] **Orchestrator** (`src/lib/tags/index.ts` `tagUntagged()`) — keyword-first, AI for the rest
  ```
  (capped 48/run), inserts `tags` rows `(articleId, topic, score)` with ON CONFLICT DO NOTHING.
  ```
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



## Phase 7 — Voting → learning loop ✅ (DONE)

- [x] `POST /api/vote` records +1 / -1 into `votes` (`src/app/api/vote/route.ts`)
- [x] `src/lib/vote.ts` `castVote()` — **one vote per article, toggle** semantics; updates
  ```
  `topic_interest.score` per topic, weighted by `tags.score`, clamped [0.1, 5], LR 0.2.
  Re-voting reverses the prior delta cleanly (no double-count).
  ```
- [x] `topic_interest` seeded lazily at neutral 1 (upsert on first touch) — no pre-seed needed.
- [x] Thumbs up/down in the feed (`src/app/Vote.tsx`, optimistic); `getFeed` returns `userVote`.
- [x] **Tag-vocabulary canonicalization:** (a) AI prompt in `ai.ts` tightened to forbid
  ```
  near-synonyms; (b) `src/lib/tags/canonical.ts` alias map applied at write time
  (`art`/`art-and-culture` → `culture`, `public-health` → `health`). One-time merge SQL
  for existing dup rows run manually (minds the tags PK).
  ```

**Note:** the feed ORDER doesn't change yet — votes move `topic_interest`, but ranking by it is
**Phase 8**. Verify Phase 7 via `topic_interest` rows moving after votes (`/api/vote` JSON + DB).
Phase 11 later made `/api/vote` authenticated and scoped by `user_id`.

---



## Phase 8 — Personalized ranking ✅ (DONE)

All in `getFeed()` (`src/lib/feed.ts`), so the page + `/api/feed` share the same ranking.

- [x] `interestScore = Σ(tag.score × topic_interest[topic]) / Σ(tag.score)` — weighted average,
  ```
  tag-count-independent; 1 = neutral (untagged or unseen topics default to interest 1).
  ```
- [x] Recency decay: `0.5 ^ (ageHours / HALF_LIFE_HOURS=48)`; `baseScore = interestScore × recency`.
  ```
  (48h chosen with Krn — "balanced": a loved topic stays competitive ~a day before recency wins.)
  ```
- [x] **Source-diversity re-rank** (the intra-outlet flooding fix): greedy pick, each story
  ```
  discounted by `DIVERSITY_DECAY=0.7 ^ (# already-shown from its outlet)` so one chatty feed
  (e.g. Economic Times) can't dominate the top.
  ```
- [x] `FeedStory.score` exposed (in `/api/feed` JSON) for verification.

**Degrades gracefully:** with no votes every `topic_interest` is 1 → `interestScore` = 1 → order is
pure recency + diversity (≈ the old behaviour). As you vote, upvoted topics float up.
**Tunables** in `feed.ts`: `HALF_LIFE_HOURS`, `DIVERSITY_DECAY`, `COLLAPSE_WINDOW`.

---



## Phase 9 — On-demand enrichment (AI summaries) ✅ (DONE)

- [x] **Shared summary cache feature:** summaries are stored once per article and reused across users,
      avoiding duplicate AI calls when multiple users summarize the same story.
- [x] `src/lib/enrich.ts` `enrichArticle(id)` — **cache-first**: returns stored `detailSummary` if
  ```
  already `enriched`; otherwise calls Gemini, stores it, sets `enrichmentStatus`.
  ```
- [x] Reads the article via **Jina Reader** (`https://r.jina.ai/<url>` → clean text), then summarizes
  ```
  that text with a **plain Gemini call**. (Gemini's `url_context` tool was tried first but failed
  even on open pages — Guardian, GitHub — so we dropped it for this two-step path, which is reliable
  and reuses the same `generateContent` call tagging uses.) Stores the 3–4 sentence `detail_summary`.
  ```
- [x] `POST /api/enrich` `{ articleId }`; **on-demand only** (the "Summarize" button), never in a poll.
- [x] `enrichmentStatus`: `raw` → `enriched`, or `failed` (paywall/blocked/no-key) → UI shows the link only.
- [x] Feed (`getFeed`/`FeedStory`) carries `detailSummary`, so an already-summarized story is a free
  ```
  show/hide toggle (`src/app/Summary.tsx`), no re-call.
  ```
- [x] Summary cache is **shared across users** because `detail_summary` lives on the global `articles`
  row, not a per-user table. If one user summarizes an article, other signed-in users can fetch the
  cached summary directly without another Gemini call.

**Notes:** reuses `GEMINI_API_KEY` (Phase 6). `body` column stays empty — URL-context doesn't return raw
text; Jina Reader could capture full body later if needed. Paywalled sites can't be read → graceful
"failed" → link only. `maxDuration=60` on the route (Gemini fetch+read can be slow). Phase 11 auth
requires a signed-in user to request enrichment, but the summary itself remains a shared article-level
cache to avoid unnecessary duplicate AI calls.

---



## Phase 10 — Frontend UI ✅ (DONE) — "Dispatch" broadsheet

Implements the `design_handoff_broadsheet_feed` spec: editorial broadsheet look, light/dark themes,
masthead, vote rail, AI-brief inset, empty + polling states.

**Architecture (3-layer, built for scale):**

- [x] `src/styles/tokens.css` — design tokens (light + dark via `[data-theme]`); single source of colour/type.
- [x] `next/font` (Newsreader + JetBrains Mono) loaded in root layout; no-flash theme script before paint.
- [x] Per-component **CSS Modules** in `src/components/`* — `Masthead`, `ThemeToggle`, `PollButton`,
  ```
  `PollProvider`, `StoryCard`, `Vote`, `Summary`, `Feed`, `EmptyState`, `states/Skeleton`.
  ```
- [x] `globals.css` shrunk to resets + shared keyframes; layout shell renders Masthead once.

**Decisions (with Krn):** AI Brief sits **below** the dek (not replacing it); kicker label = **"AI Brief"**.

**Behaviour:** light/dark toggle (persisted, no flash); vote rail (▲ score ▼); "✦ AI Brief · Gemini"
inset with loading shimmer + error states; empty state; polling state (shimmer bar + skeleton cards,
driven by a shared `PollProvider`); load-more pill. All API logic unchanged — pure restyle/restructure.

> Note: built the shell in the **root layout** (not a `(app)` route group) — the route group is the
> right move once auth/extra pages land, but couldn't drop the old `app/page.tsx` via a group without a
> duplicate-route conflict. Easy to migrate later.
> Old single-file UI (`src/app/{Feed,Vote,Summary,PollButton}.tsx`) is superseded — `git rm` them.

---



## Phase 11 — Auth + multi-user personalization ✅ (DONE)

Turn the app from single-tenant (one global taste profile) into multi-user: signup/login,
and a personalized feed + interests **scoped per user**. The personalization engine
(tagging, interest scoring, freshness/diversity ranking, learning loop) is **already built** in
Phases 6–8 — it's just global today. The work is (a) bolt on auth, (b) add `user_id` to the
two per-person tables, (c) thread `userId` through the feed + vote logic.

**Decisions (with Krn):** Auth.js (NextAuth v5) + Drizzle adapter, **both** email/password
**and** OAuth. OAuth enables Google and GitHub when their env vars are present. Existing global
`votes` + `topic_interest` data is **wiped** on migration (clean `NOT NULL user_id`, no backfill).
Shared content (`articles`, `clusters`, `tags`) stays global — news is ingested once for everyone;
only the *ranking* is personalized. Signup is open to all emails; usage limits for AI summaries are
deferred to a later phase. Onboarding interests are skipped for now; new users start neutral and
personalize through votes. The manual "Poll now" button is admin-only via `ADMIN_EMAILS`.

**Phase 11.1 — Schema & migration (wipe approach)**

- [x] Auth.js Drizzle-adapter tables: `users`, `accounts`, `sessions`, `verification_tokens`;
  ```
  add `password_hash` to `users` (null for OAuth-only users)
  ```
- [x] `topic_interest`: PK `topic` → composite `(user_id, topic)`; `user_id` FK → `users` (`onDelete: cascade`)
- [x] `votes`: add `user_id` FK → `users` (`onDelete: cascade`) + unique `(user_id, article_id)`
- [x] Migration `TRUNCATE`s `votes` + `topic_interest`, adds columns/constraints as `NOT NULL` (no backfill)
- [x] `npm run db:generate` + `db:migrate` run against Neon

**Phase 11.2 — Auth.js wiring (email/password + OAuth)**

- [x] `next-auth@beta` (v5) + `@auth/drizzle-adapter` + `bcryptjs`
- [x] Credentials provider (signup hashes with bcrypt + inserts; sign-in verifies) — forces **JWT** sessions
- [x] OAuth provider(s): Google + GitHub when configured; also uses JWT sessions (so `sessions` table unused — expected)
- [x] `middleware.ts` gating everything except `/login`, `/signup`, auth API routes, and `/api/poll`

**Phase 11.3 — UI**

- [x] `/login` + `/signup` pages: email/password form **+** OAuth buttons
- [ ] `(app)` route group for authed pages (deferred; middleware gates the existing root page for now)
- [x] `Masthead`: signed-in user + sign-out (beside `ThemeToggle` / admin-only `PollButton`)

**Phase 11.4 — Scope logic by user**

- [x] `getFeed(userId, …)` — filter the `votes` leftJoin and `loadInterest()` by `userId`
- [x] `castVote(userId, articleId, value)` — scope select/delete/insert + `topic_interest` upsert (now keyed `(user_id, topic)`)
- [x] `/api/feed`, `/api/vote`, `/api/enrich` — read session → pass `userId`, 401 if unauthenticated;
  ```
  `page.tsx` + `actions.ts` read session server-side. `/api/poll` stays a global system endpoint.
  ```

**Phase 11.5 — Onboarding interests (deferred)**

- [~] Post-signup interest picker skipped for now; users start neutral and personalize through votes

- [ ] (Optional, later) settings page to edit interests

**Later DB hygiene:** add a retention/archive policy for old `articles`/`clusters`/`tags` once the app
has enough real usage to choose a cutoff safely.

---

*Last updated: 2026-06-28 — Phase 11 done for current scope: auth + per-user personalization wiring implemented through login/signup, Google/GitHub OAuth config, middleware, admin-only poll, user-scoped feed/vote/session routes, and Neon migration. Onboarding interests are intentionally deferred;* `(app)` *route group cleanup, settings page, and later AI/DB usage limits remain future work. Phases 1–10 done.*
