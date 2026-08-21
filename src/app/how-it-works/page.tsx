import Link from "next/link";
import type { Metadata } from "next";
import styles from "./how-it-works.module.css";

export const metadata: Metadata = {
  title: "How Brief works",
  description:
    "How Brief turns a firehose of headlines into one clean, ranked feed that learns what you care about — fetching, de-duplicating, tagging, and ranking, explained.",
};

/**
 * Public explainer. Layered on purpose: each step reads as plain English with a
 * real-life analogy, and a collapsible "Under the hood" reveals the actual
 * formula/constants for readers who want them. Native <details> = no client JS.
 */
export default function HowItWorks() {
  return (
    <article className={styles.page}>
      <header className={styles.head}>
        <p className={styles.kicker}>How it works</p>
        <h1 className={styles.title}>How Brief builds your feed</h1>
        <p className={styles.lede}>
          Every day dozens of sources put out hundreds of stories. Brief&rsquo;s whole job is to turn
          that pile into a feed that&rsquo;s actually yours: it clears out the duplicates, works out what
          each story is about, and learns a little more about your taste every time you vote. Here&rsquo;s
          the full path one story takes to reach you, step by step. Want the real numbers behind a step?
          Open its <span className={styles.inlineHood}>Under the hood</span>.
        </p>
        <Link href="/" className={styles.back}>
          &larr; Back to your feed
        </Link>
      </header>

      <section className={styles.overview}>
        <h2 className={styles.overviewTitle}>The 30-second version</h2>
        <p className={styles.overviewText}>
          Brief is two halves that never talk to each other directly — they only pass notes through the
          database. One half <strong>writes</strong> (goes out, gathers news, files it neatly). The
          other half <strong>reads</strong> (pulls that filed news back out and ranks it for you). Your
          👍 / 👎 is the bridge: it teaches the reading half what to float up.
        </p>

        <div className={styles.diagram} aria-hidden="true">
          <div className={styles.lane}>
            <span className={styles.laneTag}>Write path — every few hours</span>
            <div className={styles.flow}>
              <span className={styles.node}>Fetch</span>
              <span className={styles.arrow}>→</span>
              <span className={styles.node}>Clean</span>
              <span className={styles.arrow}>→</span>
              <span className={styles.node}>De-dupe</span>
              <span className={styles.arrow}>→</span>
              <span className={styles.node}>Tag</span>
            </div>
          </div>

          <div className={styles.db}>
            <span className={styles.dbLabel}>Database</span>
            <span className={styles.dbSub}>articles · clusters · tags · interests · votes</span>
          </div>

          <div className={styles.lane}>
            <span className={styles.laneTag}>Read path — every page load</span>
            <div className={styles.flow}>
              <span className={styles.node}>Collapse</span>
              <span className={styles.arrow}>→</span>
              <span className={styles.node}>Score</span>
              <span className={styles.arrow}>→</span>
              <span className={styles.node}>Diversify</span>
              <span className={styles.arrow}>→</span>
              <span className={styles.nodeYou}>Your feed</span>
            </div>
          </div>
        </div>

        <p className={styles.example}>
          We&rsquo;ll follow one real-ish story the whole way down:{" "}
          <em>&ldquo;Australia tightens student visa rules amid migration crackdown&rdquo;</em>, which
          three different outlets happen to run on the same morning.
        </p>
      </section>

      <ol className={styles.steps}>
        <li className={styles.step}>
          <div className={styles.num}>1</div>
          <div className={styles.stepBody}>
            <h2 className={styles.stepTitle}>Fetch the news</h2>
            <p className={styles.stepText}>
              Several times a day, Brief visits every source it follows — Hacker News and a set of RSS feeds —
              and pulls down whatever&rsquo;s new. Each source has its own little adapter, but they all
              hand back the same tidy shape, so nothing downstream has to care where a story came from.
            </p>
            <p className={styles.analogy}>
              <span className={styles.analogyTag}>Like</span> a clipping service that checks every
              newspaper through the day and drops the cuttings in one basket — and if one paper doesn&rsquo;t
              show up, the others still get read.
            </p>
            <details className={styles.hood}>
              <summary>Under the hood</summary>
              <div className={styles.hoodBody}>
                <p>
                  A scheduled job hits <code>POST /api/poll</code> (guarded by a secret). Every source is
                  wrapped in its own <code>try/catch</code>, so one broken feed is recorded and skipped
                  while the rest continue. Adapters all return{" "}
                  <code>{"{ source, title, canonicalUrl, summary, publishedAt }"}</code>.
                </p>
              </div>
            </details>
          </div>
        </li>

        <li className={styles.step}>
          <div className={styles.num}>2</div>
          <div className={styles.stepBody}>
            <h2 className={styles.stepTitle}>Clean &amp; fingerprint it</h2>
            <p className={styles.stepText}>
              Raw feeds are messy — HTML tags, <code>&amp;#x27;</code> gremlins, inconsistent fields.
              One central step scrubs every article into plain text and stamps it with a unique
              fingerprint, so the exact same article is never stored twice.
            </p>
            <p className={styles.analogy}>
              <span className={styles.analogyTag}>Like</span> retyping every scrappy cutting onto an
              identical index card, and refusing to file a card you already have.
            </p>
            <details className={styles.hood}>
              <summary>Under the hood</summary>
              <div className={styles.hoodBody}>
                <p>
                  A single <code>normalizeArticle</code> strips HTML, decodes entities, and computes a{" "}
                  <code>contentHash</code>. The <code>canonical_url</code> column is <code>UNIQUE</code>{" "}
                  and inserts use <code>ON CONFLICT DO NOTHING</code>, so re-polling inserts{" "}
                  <strong>0 duplicates</strong> — the whole poll is idempotent. Cleaning lives in one
                  place on purpose: a new source can&rsquo;t leak markup into the database even if it
                  forgets to sanitise.
                </p>
              </div>
            </details>
          </div>
        </li>

        <li className={styles.step}>
          <div className={styles.num}>3</div>
          <div className={styles.stepBody}>
            <h2 className={styles.stepTitle}>Group the same story (de-dupe)</h2>
            <p className={styles.stepText}>
              When five outlets cover the visa story, you don&rsquo;t want it five times. Brief compares
              headlines and merges the matches into a single story — remembering how many outlets carried
              it, which is itself a useful &ldquo;this is a big deal&rdquo; signal.
            </p>
            <p className={styles.analogy}>
              <span className={styles.analogyTag}>Like</span> a news editor pinning every cutting about
              the same event into one folder, instead of ten folders that all say the same thing.
            </p>
            <details className={styles.hood}>
              <summary>Under the hood</summary>
              <div className={styles.hoodBody}>
                <p>
                  Titles are tokenised (lowercase, drop stopwords and tokens under 3 chars). Similarity
                  is the <strong>overlap coefficient</strong>:
                </p>
                <pre className={styles.formula}>
                  similarity = shared tokens / size of the smaller title
                </pre>
                <p>Two articles merge when all of these hold:</p>
                <ul className={styles.tight}>
                  <li>overlap &ge; <code>0.5</code></li>
                  <li>they share &ge; <code>2</code> meaningful tokens</li>
                  <li>published within <code>3 days</code> of each other</li>
                  <li>
                    they&rsquo;re from <strong>different outlets</strong> (this stops one outlet&rsquo;s
                    templated &ldquo;Stocks to watch…&rdquo; headlines false-merging)
                  </li>
                </ul>
                <p>
                  Our visa story from three outlets → one cluster with <code>source_count = 3</code>.
                </p>
              </div>
            </details>
          </div>
        </li>

        <li className={styles.step}>
          <div className={styles.num}>4</div>
          <div className={styles.stepBody}>
            <h2 className={styles.stepTitle}>Work out what it&rsquo;s about (tag)</h2>
            <p className={styles.stepText}>
              Each story gets one or more topic labels with a strength score. Most are caught instantly
              by keyword rules. Anything the rules miss is handed to an AI, which either reuses an
              existing label or coins a brand-new one — so the vocabulary can grow toward new interests
              instead of hitting a ceiling.
            </p>
            <p className={styles.analogy}>
              <span className={styles.analogyTag}>Like</span> a librarian stamping subject labels on each
              folder — and when nothing on the shelf fits, inventing a sensible new label rather than
              leaving it blank.
            </p>
            <details className={styles.hood}>
              <summary>Under the hood</summary>
              <div className={styles.hoodBody}>
                <p>
                  <strong>Tier 1 — keywords (free, instant).</strong> For each topic, count keyword hits
                  with the title weighted double:
                </p>
                <pre className={styles.formula}>
                  raw = 2 × title-hits + 1 × summary-hits{"\n"}
                  score = min(1, raw / 4){"  "}// keep only if raw ≥ 2
                </pre>
                <p>
                  <strong>Tier 2 — AI fallback (open vocabulary).</strong> Only for stories that match no
                  keyword topic: the model is sent the article <em>plus the current tag list</em> and
                  asked to reuse or coin a kebab-case tag (fixed strength <code>0.6</code>). Batched 12 at
                  a time, capped at 48 per poll to stay on the free tier; a near-synonym alias map keeps{" "}
                  <code>art</code> / <code>culture</code> from splintering.
                </p>
                <p>
                  Visa story → <code>immigration: 1.0</code>, <code>australia: 0.75</code>.
                </p>
              </div>
            </details>
          </div>
        </li>

        <li className={styles.step}>
          <div className={styles.num}>5</div>
          <div className={styles.stepBody}>
            <h2 className={styles.stepTitle}>You vote — and it learns</h2>
            <p className={styles.stepText}>
              A 👍 or 👎 isn&rsquo;t about that one article — it teaches Brief about its{" "}
              <em>topics</em>. Upvote the visa story and your interest in <em>immigration</em> and{" "}
              <em>australia</em> both nudge up, so future stories on those topics rise. Each account
              learns on its own.
            </p>
            <p className={styles.analogy}>
              <span className={styles.analogyTag}>Like</span> telling the librarian &ldquo;more like
              this&rdquo; — and having them remember it by <em>subject</em>, not just that single
              clipping.
            </p>
            <details className={styles.hood}>
              <summary>Under the hood</summary>
              <div className={styles.hoodBody}>
                <p>
                  Every topic&rsquo;s interest starts at <code>1</code> (neutral). One vote per
                  (user, article) — voting the same way again clears it, the opposite flips it (computed
                  as <code>delta = new − old</code>, so nothing double-counts). For each of the
                  story&rsquo;s tags:
                </p>
                <pre className={styles.formula}>
                  interest += 0.2 × delta × tag.score{"\n"}
                  interest = clamp(interest, 0.1, 5)
                </pre>
                <p>
                  So upvoting the visa story (immigration 1.0, australia 0.75) →{" "}
                  <code>immigration 1.20</code>, <code>australia 1.15</code>; topics you never touch stay
                  at 1 and don&rsquo;t sway anything.
                </p>
              </div>
            </details>
          </div>
        </li>

        <li className={styles.step}>
          <div className={styles.num}>6</div>
          <div className={styles.stepBody}>
            <h2 className={styles.stepTitle}>Rank your feed</h2>
            <p className={styles.stepText}>
              Every time the page loads, each story gets a score built from three things: how much you
              like its topics, how fresh it is, and a nudge that stops any single outlet from hogging the
              top. Brand-new here with no votes? You simply get newest-first with a good spread — nothing
              looks broken.
            </p>
            <p className={styles.analogy}>
              <span className={styles.analogyTag}>Like</span> a personal front-page editor laying out the
              paper by what you care about and what&rsquo;s newest — while making sure it isn&rsquo;t all
              from one masthead.
            </p>
            <details className={styles.hood}>
              <summary>Under the hood</summary>
              <div className={styles.hoodBody}>
                <pre className={styles.formula}>
                  interest = Σ(tag.score × your-interest) / Σ(tag.score){"\n"}
                  freshness = 0.5 ^ (ageHours / 48){"   "}// 1 now, ½ at 48h, ¼ at 96h{"\n"}
                  base = interest × freshness
                </pre>
                <p>
                  Then a diversity re-rank fills slots one at a time: a story&rsquo;s{" "}
                  <em>effective</em> score is discounted for each story already shown from its outlet.
                </p>
                <pre className={styles.formula}>
                  effective = base × 0.7 ^ (stories already shown from this outlet)
                </pre>
                <p>
                  So the 2nd story from an outlet is ×0.7, the 3rd ×0.49 — outlets interleave. We pick
                  one at a time (not a plain sort) because each pick changes the next round&rsquo;s
                  penalties.
                </p>
              </div>
            </details>
          </div>
        </li>

        <li className={styles.step}>
          <div className={styles.num}>7</div>
          <div className={styles.stepBody}>
            <h2 className={styles.stepTitle}>Summarise on demand</h2>
            <p className={styles.stepText}>
              Brief doesn&rsquo;t waste money summarising things you&rsquo;ll never open. Hit{" "}
              <strong>Summarize</strong> on a story and it fetches the full article, has an AI write a
              short recap, and remembers it — so opening it again (for anyone) is instant and free.
            </p>
            <p className={styles.analogy}>
              <span className={styles.analogyTag}>Like</span> asking a colleague for the gist only when
              you actually care — and having them jot it on the folder so no one has to read it twice.
            </p>
            <details className={styles.hood}>
              <summary>Under the hood</summary>
              <div className={styles.hoodBody}>
                <p>
                  <code>POST /api/enrich</code>: cached summary → returned free; otherwise a reader
                  service pulls clean article text and a single AI call summarises it in 3–4 sentences,
                  stored on the article and shared across users. Paywalled or unreadable pages degrade
                  gracefully to just the link, with a diagnosable reason — never a broken card.
                </p>
              </div>
            </details>
          </div>
        </li>
      </ol>

      <section className={styles.knobs}>
        <h2 className={styles.knobsTitle}>Every number here is a knob</h2>
        <p className={styles.knobsText}>
          The <code>0.5</code> match threshold, the <code>48</code>-hour freshness half-life, the{" "}
          <code>0.7</code> diversity penalty, the <code>0.2</code> learning rate — none are magic. Each
          is a single named constant at the top of its file, tuned to taste. Turn one, redeploy, and the
          feed behaves differently.
        </p>
        <Link href="/" className={styles.cta}>
          Back to your feed &rarr;
        </Link>
      </section>
    </article>
  );
}
