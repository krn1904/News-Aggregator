# News Aggregator

Personalized, multi-source, self-learning news app.
Stack: **Next.js (TypeScript)** · **Neon** (serverless Postgres) · **Drizzle ORM** · Vercel + GitHub Actions.

This repo is at **Phase 1 — Data layer**. The database schema and a DB round-trip
test exist. No news is fetched yet (that's Phase 2).

## What's in this phase
- `src/db/schema.ts` — all 5 tables (articles, clusters, tags, topic_interest, votes), matching the design doc §10.
- `src/db/index.ts` — Neon HTTP client (serverless-safe, no connection-pool exhaustion).
- `drizzle/0000_phase1_init.sql` — generated migration.
- `src/app/api/health` — liveness probe (no DB).
- `src/app/api/db-check` — proves the app can read+write Neon.

## One-time setup (your part)
1. **Create a free Neon project** at neon.tech → open *Connection Details* → copy the **Pooled** connection string.
2. `cp .env.example .env.local` and paste it as `DATABASE_URL`. Set a long random `POLL_SECRET`.
3. Install + create the tables:
   ```bash
   npm install
   npm run db:migrate     # applies drizzle/0000_phase1_init.sql to Neon
   ```

## Verify Phase 1
```bash
npm run dev
# then in another terminal:
curl localhost:3000/api/health     # -> { ok: true, ... }
curl localhost:3000/api/db-check   # -> { ok: true, roundTrip: { topic: "__db_check__", ... } }
```
If `db-check` returns `ok: true`, the data layer works and we're ready for Phase 2.

## Useful scripts
| command | does |
|---|---|
| `npm run dev` | local dev server |
| `npm run db:generate` | regenerate migration after editing the schema |
| `npm run db:migrate` | apply migrations to Neon |
| `npm run typecheck` | `tsc --noEmit` |

## Next: Phase 2
Add `POST /api/poll` to fetch one source (Hacker News / Algolia), normalize, and store —
then `GET /api/feed` to read it back.
