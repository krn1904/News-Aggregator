# News Aggregator

Personalized, multi-source, self-learning news app.
Stack: **Next.js (TypeScript)** · **Neon** (serverless Postgres) · **Drizzle ORM** · Google **Gemini** · Vercel + GitHub Actions.

It pulls news from several sources, **de-duplicates** the same story across outlets, **tags** each
article by topic (keyword rules + AI for anything new), **learns** what you like from your 👍/👎,
and **ranks** your feed accordingly — with on-demand AI **summaries**.

- Full phase plan & progress: `[documents/ROADMAP.md](documents/ROADMAP.md)`
- **How the tagging / scoring / ranking actually works (with a worked example):** `[documents/CORE-LOGIC.md](documents/CORE-LOGIC.md)`



## How it works (one breath)

Two halves that only ever talk through the database:

- **Write path** (`POST /api/poll`, run by a daily cron): fetch every source → normalize → insert new
articles (dedup on `canonical_url`) → **cluster** same-story duplicates → **tag** by topic.
- **Read path** (`GET /api/feed`, the page): collapse clusters into one story each → **score** by
`your interest × freshness` → **re-rank** for source diversity → return a page.

Your 👍/👎 (`POST /api/vote`) update a per-topic interest profile that the read path ranks by.
See `[documents/CORE-LOGIC.md](documents/CORE-LOGIC.md)` for the formulas and a full example.

## Endpoints


| Route           | Method | Purpose                                                                         |
| --------------- | ------ | ------------------------------------------------------------------------------- |
| `/api/health`   | GET    | Liveness probe (no DB)                                                          |
| `/api/db-check` | GET    | Proves the app can read+write Neon                                              |
| `/api/poll`     | POST   | Ingest + cluster + tag all sources. Auth: `Authorization: Bearer <POLL_SECRET>` |
| `/api/feed`     | GET    | Ranked feed of stories (`?limit`, `?offset`)                                    |
| `/api/vote`     | POST   | `{ articleId, value: 1 | -1 }` — record a vote, update topic interest           |
| `/api/enrich`   | POST   | `{ articleId }` — generate (and cache) an AI summary on demand                  |




## Setup

1. **Neon** — create a free project → copy the **Pooled** connection string.
2. **Gemini** — get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
3. `cp .env.example .env.local` and fill it in (see table below).
4. Install + create tables:
  ```bash
   npm install
   npm run db:migrate
  ```



### Environment variables


| Variable         | Where                                             | Purpose                                                                                                                |
| ---------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | `.env.local` + Vercel                             | Neon **pooled** connection string                                                                                      |
| `POLL_SECRET`    | `.env.local` + Vercel + **GitHub Actions secret** | Bearer secret guarding `/api/poll`                                                                                     |
| `GEMINI_API_KEY` | `.env.local` + Vercel (**not** GitHub)            | AI tagging (Phase 6) + summaries (Phase 9). Without it, tagging falls back to keyword-only and summaries are disabled. |
| `APP_URL`        | **GitHub Actions secret**                         | Deployed URL the cron polls (no trailing slash)                                                                        |
| `GEMINI_MODEL`   | optional                                          | Override the model (defaults to `gemini-2.5-flash`)                                                                    |


> Gotcha: env vars are baked in at **build time** — after adding/changing one in Vercel you must **redeploy**, and the variable's **environment scope** (Production / Preview) must match the URL you hit.



## Run & verify

```bash
npm run dev
curl localhost:3000/api/health
curl -X POST localhost:3000/api/poll -H "Authorization: Bearer $POLL_SECRET"   # -> { totals, perSource, clustering, tagging }
curl "localhost:3000/api/feed?limit=5"                                          # -> { ok, count, articles:[...] }
```

Or open `http://localhost:3000`, click **Poll now**, then thumbs up/down stories and **Summarize**.

## Scheduled polling

`.github/workflows/poll.yml` calls the deployed `/api/poll` daily (20:00 UTC = 06:00 Melbourne) and on
manual dispatch. Add `APP_URL` + `POLL_SECRET` as GitHub Actions secrets; the schedule activates once the
workflow is on `main`.

## Useful scripts


| command               | does                                          |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | local dev server                              |
| `npm run db:generate` | regenerate migration after editing the schema |
| `npm run db:migrate`  | apply migrations to Neon                      |
| `npm run typecheck`   | `tsc --noEmit`                                |




## Tuning

The behaviour knobs (ranking half-life, diversity strength, tag keyword lists, learning rate, etc.)
and how to change them are documented in `[documents/CORE-LOGIC.md](documents/CORE-LOGIC.md#tuning)`.