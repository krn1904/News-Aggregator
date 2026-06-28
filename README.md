# News Aggregator

Personalized, multi-source, self-learning news app.
Stack: **Next.js (TypeScript)** · **Neon** (serverless Postgres) · **Drizzle ORM** · Google **Gemini** · Vercel + GitHub Actions.

It pulls news from several sources, **de-duplicates** the same story across outlets, **tags** each
article by topic (keyword rules + AI for anything new), **learns** what you like from your 👍/👎,
and **ranks** your signed-in feed accordingly — with on-demand AI **summaries**.
Summaries are cached at the article level, so once any user summarizes a story, every signed-in user
can open that same summary without another AI call.

- Full phase plan & progress: `[documents/ROADMAP.md](documents/ROADMAP.md)`
- **How the tagging / scoring / ranking actually works (with a worked example):** `[documents/CORE-LOGIC.md](documents/CORE-LOGIC.md)`



## How it works (one breath)

Two halves that only ever talk through the database:

- **Write path** (`POST /api/poll`, run by a daily cron): fetch every source → normalize → insert new
articles (dedup on `canonical_url`) → **cluster** same-story duplicates → **tag** by topic.
- **Auth path** (Auth.js): signup/login with email/password or OAuth; `votes` and `topic_interest`
are scoped per user.
- **Read path** (`GET /api/feed`, the page): collapse clusters into one story each → **score** by
`your interest × freshness` → **re-rank** for source diversity → return a page.

Your 👍/👎 (`POST /api/vote`) update your per-topic interest profile that the read path ranks by.
See `[documents/CORE-LOGIC.md](documents/CORE-LOGIC.md)` for the formulas and a full example.

## Endpoints


| Route           | Method | Purpose                                                                         |
| --------------- | ------ | ------------------------------------------------------------------------------- |
| `/api/health`   | GET    | Liveness probe (no DB)                                                          |
| `/api/db-check` | GET    | Proves the app can read+write Neon                                              |
| `/api/poll`     | POST   | Ingest + cluster + tag all sources. Auth: `Authorization: Bearer <POLL_SECRET>` |
| `/api/auth/*`   | GET/POST | Auth.js login, OAuth callback, and session endpoints                            |
| `/api/feed`     | GET    | Signed-in user's ranked feed of stories (`?limit`, `?offset`)                   |
| `/api/vote`     | POST   | Signed-in user's `{ articleId, value: 1 | -1 }` vote → update topic interest    |
| `/api/enrich`   | POST   | Signed-in user's `{ articleId }` request → generate/cache a shared article summary |




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
| `AUTH_SECRET`    | `.env.local` + Vercel                             | Auth.js session/JWT secret                                                                                             |
| `AUTH_URL`       | `.env.local` + Vercel                             | Canonical deployed URL for Auth.js, e.g. `https://brief.karansoni.live`                                                |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | `.env.local` + Vercel          | Optional Google OAuth login                                                                                            |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | `.env.local` + Vercel          | Optional GitHub OAuth login. Callback URL: `/api/auth/callback/github` on the deployed domain                          |
| `ADMIN_EMAILS`   | `.env.local` + Vercel                             | Comma-separated emails allowed to use the manual **Poll now** button                                                   |
| `GEMINI_API_KEY` | `.env.local` + Vercel (**not** GitHub)            | AI tagging (Phase 6) + summaries (Phase 9). Without it, tagging falls back to keyword-only and summaries are disabled. |
| `APP_URL`        | **GitHub Actions secret**                         | Deployed URL the cron polls (no trailing slash)                                                                        |
| `GEMINI_MODEL`   | optional                                          | Override the model (defaults to `gemini-2.5-flash`)                                                                    |


> Gotcha: env vars are baked in at **build time** — after adding/changing one in Vercel you must **redeploy**, and the variable's **environment scope** (Production / Preview) must match the URL you hit.



## Run & verify

```bash
npm run dev
curl localhost:3000/api/health
curl -X POST localhost:3000/api/poll -H "Authorization: Bearer $POLL_SECRET"   # -> { totals, perSource, clustering, tagging }
```

Or open `http://localhost:3000`, sign in, then thumbs up/down stories and **Summarize**.
The manual **Poll now** button appears only when your email is listed in `ADMIN_EMAILS`.

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
