# Core Logic — how the app tags, scores & ranks the news

This is the "how it actually works" document. It explains every computation the app does to turn raw
articles into a personalized feed, and which knob to turn to change each behaviour. A full worked
example runs at the end.

---

## 1. The big picture: two halves, joined by the database

```
WRITE PATH  (POST /api/poll, run by the daily cron)
  fetch sources → normalize → insert (dedup) → CLUSTER → TAG
        │
        ▼
   [ Postgres:  articles · clusters · tags · topic_interest · votes ]
        ▲                                        │
        │ votes update topic_interest            ▼
  POST /api/vote                          READ PATH (GET /api/feed, the page)
                                          collapse clusters → SCORE → diversify → page
```

The two halves never call each other — they share only the database. The write path **produces and
stores** (cluster ids, tags); the read path **reads and ranks**. This is why `getFeed` never tags or
clusters: that work was already done at poll time.

### The tables
| Table | Holds | Written by |
|---|---|---|
| `articles` | one row per fetched article (title, url, summary, `cluster_id`, `detail_summary`, `enrichment_status`) | ingest / cluster / enrich |
| `clusters` | one row per *story* (`representative_article_id`, `source_count`) | clustering |
| `tags` | `(article_id, topic, score)` — an article's topics | tagging |
| `topic_interest` | `(topic, score)` — how much **you** like each topic | voting |
| `votes` | `(article_id, value)` — your 👍/👎 | voting |

---

## 2. Ingest & normalize

Every source (Hacker News JSON, RSS feeds) has its own adapter, but they all output the **same shape**:
`{ source, title, canonicalUrl, summary, publishedAt, contentHash }`. Because everything normalizes to
this early, the rest of the pipeline never cares where an article came from.

- **Dedup:** `canonical_url` is `UNIQUE`; inserts use `ON CONFLICT DO NOTHING`, so re-polling inserts 0
  duplicates (idempotent).
- **Resilience:** each source is wrapped in try/catch — one broken feed doesn't stop the rest.

---

## 3. Clustering — "is this the same story?"  (`src/lib/cluster.ts`)

Goal: when several outlets run the same story, group them so the feed shows it once.

**Step A — tokenize the title.** Lowercase, split on non-alphanumerics, drop stopwords and tokens
shorter than 3 chars. `"Sensex closes 400 points higher"` → `{sensex, closes, 400, points, higher}`.

**Step B — similarity = overlap coefficient.**

```
similarity(A, B) = (# shared tokens) / size of the smaller token set
```

We use overlap (not Jaccard) because it's forgiving when one headline is longer than the other — the
common cross-outlet case.

**Step C — decide a match.** Two articles cluster together when **all** of:
- `similarity ≥ OVERLAP_THRESHOLD` (0.5)
- they share `≥ MIN_SHARED_TOKENS` (2) meaningful tokens
- they're within `MATCH_WINDOW_MS` (3 days) of each other
- **they're from *different* outlets** (cross-outlet only — one article per outlet per cluster)

That last rule is important: it stops one outlet's templated headlines ("Sensex today…", "Stocks to
watch…") from false-merging into giant clusters. Same-outlet near-duplicates are a *diversity* signal
for ranking, not a merge.

**Result:** each article gets a `cluster_id`; `clusters.source_count` tracks how many outlets carry it.
Runs over unclustered articles only, so it's idempotent.

---

## 4. Tagging — "what is this about?"  (`src/lib/tags/`)

Each article gets 1–N topics, each with a **strength score 0–1**. Two tiers:

### Tier 1 — keyword taxonomy (free, instant) — `taxonomy.ts` + `keyword.ts`
A fixed map of `topic → keyword list` (technology, politics, business, markets, economy, sport,
immigration, australia, india, jobs). For each topic we count keyword hits, **title weighted ×2** over
summary:

```
raw   = 2 × (title hits) + 1 × (summary hits)
score = min(1, raw / SCORE_NORM)        # SCORE_NORM = 4
keep the topic only if raw ≥ MIN_RAW    # MIN_RAW = 2  (i.e. ≥1 title hit, or ≥2 summary hits)
```

### Tier 2 — AI fallback (open vocabulary) — `ai.ts`
Only for articles that match **no** keyword topic. We send Gemini the article **plus the current list of
existing tags**, and ask it to reuse a fitting tag or coin a new kebab-case one. AI tags get a fixed
strength of `AI_TAG_SCORE` (0.6). This is what lets the vocabulary **grow** toward new interests — an
untagged story can never be learned from.

- Batched (12 articles/call), capped at 48 articles per poll (`MAX_AI_ARTICLES`) to stay free-tier-safe.
- Graceful: no key / error → article stays untagged, retried next poll.

### Canonicalization — `canonical.ts`
The AI sometimes invents near-synonyms (`art` / `art-and-culture` / `culture`). A small alias map
collapses these to one canonical label at write time, and the prompt forbids new near-synonyms.

---

## 5. Voting → the learning loop  (`src/lib/vote.ts`)

A vote teaches the app about **topics**, not just one article. `topic_interest.score` starts at **1
(neutral)**; votes move it.

- **Toggle semantics:** voting the same way again clears it; the opposite flips it. We compute
  `delta = newValue − oldValue` so re-voting reverses the old effect — no double counting.
- For each of the article's tags:

```
adjustment = LEARNING_RATE × delta × tag.score      # LEARNING_RATE = 0.2
new interest = clamp(old interest + adjustment, 0.1, 5)
```

So upvoting a story that's strongly about `immigration` (tag score 0.9) moves immigration interest more
than a story only weakly about it. Topics you never vote on stay at 1 and don't affect ranking.

---

## 6. Ranking — ordering your feed  (`src/lib/feed.ts`)

Computed fresh on every feed load (read-only). Three numbers per story:

**(a) Interest score** — tag-strength-weighted average of your interest in its topics:

```
interestScore = Σ(tag.score × interest[topic]) / Σ(tag.score)
              = 1 when untagged or all topics are neutral
```

Dividing by `Σ(tag.score)` makes it independent of how many tags a story has, centred at 1.

**(b) Freshness** — exponential decay:

```
freshness = 0.5 ^ (ageHours / HALF_LIFE_HOURS)      # HALF_LIFE_HOURS = 48
          = 1 now, 0.5 at 48h, 0.25 at 96h
```

**(c) Base score** = `interestScore × freshness`. This is the number shown as `score` in `/api/feed`.

**(d) Source-diversity re-rank.** Instead of a plain sort, we fill the feed slot-by-slot: each round
pick the highest *effective* score, where

```
effective = base × DIVERSITY_DECAY ^ (# stories from this outlet already placed)   # DECAY = 0.7
```

So the 2nd story from an outlet is ×0.7, the 3rd ×0.49, etc. — sources interleave so no single outlet
stacks the top. We pick one at a time (a `while` loop, not `sort`) because each pick changes the next
round's penalties.

> Note: the feed is *ordered* by `effective`, but the `score` field reports raw `base`. A bumped-down
> second story can therefore appear lower than one with a smaller `score` — that's expected.

With **no votes**, every interest is 1 → `interestScore` is 1 → ranking is just freshness + diversity
(graceful "newest first").

---

## 7. Summaries — on demand  (`src/lib/enrich.ts`)

Clicking **Summarize** calls `/api/enrich`:
1. If already summarized → return the cached `detail_summary` (free).
2. Else **Jina Reader** (`https://r.jina.ai/<url>`) fetches clean article text, then a plain **Gemini**
   call summarizes it in 3–4 sentences; we store it and set `enrichment_status = 'enriched'`.
3. Paywalled/blocked pages → `failed` → the UI just shows the link.

On-demand only (never during a poll) keeps cost tiny; caching means a second open is free.

---

## 8. A full worked example

A poll fetches **4 articles**. Watch them flow through the whole pipeline.

```
#1  Economic Times   "Sensex closes 400 points higher; Nifty tops 24,000"   (now)
#2  Livemint         "Sensex ends higher by ~400 pts, Nifty above 24000"    (now)
#3  Guardian AU      "Australia tightens student visa rules amid migration crackdown"  (now)
#4  Hacker News      "Show HN: a tiny local-first note app"                  (now)
```

### Cluster
#1 and #2 share `{sensex, nifty, 400, points/pts, higher, 24000}` → overlap ≥ 0.5, ≥2 shared, same day,
**different outlets** → they merge into **one story** (`source_count = 2`, headline = the most recent).
#3 and #4 are their own single-outlet stories.

→ 4 articles become **3 stories**: *Sensex* (ET+Livemint), *Australia visa* (Guardian), *Note app* (HN).

### Tag
| Story | Keyword hits | Tags (topic: score) |
|---|---|---|
| Sensex | sensex, nifty, points → markets; (india via "nifty"? no) | `markets: 1.0` |
| Australia visa | visa, student visa, migration → immigration; australia → australia | `immigration: 1.0`, `australia: 0.75` |
| Note app | none match keywords → **AI fallback** coins | `technology: 0.6` |

### Vote
You 👍 the **Australia visa** story. Its tags are `immigration 1.0`, `australia 0.75`. With
`LEARNING_RATE 0.2`:

```
immigration: 1 + 0.2 × (+1) × 1.0  = 1.20
australia:   1 + 0.2 × (+1) × 0.75 = 1.15
markets, technology: untouched → stay 1.0
```

### Rank (all 3 stories are ~now, so freshness ≈ 1.0)
```
Australia visa : interest = (1.0×1.20 + 0.75×1.15) / (1.0+0.75) = 2.0625/1.75 = 1.179  → base ≈ 1.18
Note app       : interest = (0.6×1.0)/0.6 = 1.0                                        → base ≈ 1.00
Sensex         : interest = (1.0×1.0)/1.0 = 1.0                                        → base ≈ 1.00
```
Diversity: all three are different outlets, so no penalties apply. Final order:

```
1. Australia visa   (1.18)   ← floated up because you upvoted immigration/australia
2. Note app         (1.00)
3. Sensex           (1.00)
```

If you **downvoted** the Sensex story instead, `markets` would drop below 1 and the Sensex story would
sink beneath the neutral ones. If two Sensex-type stories came from the *same* outlet, the second would
be ×0.7 and a different outlet's story would slot above it.

### Summarize
Click **Summarize** on the Australia visa story → Jina fetches the Guardian page → Gemini returns a
3–4 sentence summary → stored. Next open is instant.

---

## 9. Tuning

All knobs are plain constants at the top of their file — change the number, redeploy, done.

| Want to… | File | Constant | Effect |
|---|---|---|---|
| Make your tastes matter more / less vs freshness | `feed.ts` | `HALF_LIFE_HOURS` (48) | Higher = loved topics stay up longer; lower = recency dominates |
| Interleave outlets more / less aggressively | `feed.ts` | `DIVERSITY_DECAY` (0.7) | Lower (e.g. 0.5) = stronger spreading; 1.0 = no diversity |
| Rank over more / fewer recent articles | `feed.ts` | `COLLAPSE_WINDOW` (400) | How deep the feed can page |
| Make votes move interest faster / slower | `vote.ts` | `LEARNING_RATE` (0.2) | Bigger = each vote shifts interest more |
| Cap how extreme interest can get | `vote.ts` | `MIN_SCORE` / `MAX_SCORE` (0.1 / 5) | Bounds a topic's pull |
| Loosen / tighten "same story" matching | `cluster.ts` | `OVERLAP_THRESHOLD` (0.5), `MIN_SHARED_TOKENS` (2), `MATCH_WINDOW_MS` (3d) | Lower threshold = more merges (risk false merges) |
| Add / refine topics & keywords | `tags/taxonomy.ts` | `TAXONOMY` | Each `topic → [keywords]`; add a keyword or a whole topic |
| Change keyword scoring | `tags/keyword.ts` | `TITLE_WEIGHT`, `SUMMARY_WEIGHT`, `SCORE_NORM`, `MIN_RAW` | How hits become a 0–1 score and the keep threshold |
| Control AI tagging cost | `tags/index.ts` | `MAX_AI_ARTICLES` (48), `AI_BATCH` (12), `TAG_RECENCY_DAYS` (14) | How many articles AI tags per poll |
| Merge duplicate AI topics | `tags/canonical.ts` | `ALIASES` | Map a synonym → canonical topic |
| Swap the AI model | env | `GEMINI_MODEL` | Defaults to `gemini-2.5-flash` |

> After changing a constant, redeploy. Re-tagging/re-clustering existing rows isn't automatic — clear
> the relevant rows (e.g. `DELETE FROM tags`) and re-poll if you want the change applied retroactively.
