import type { FeedStory } from "@/lib/feed";
import Vote from "@/components/Vote/Vote";
import Summary from "@/components/Summary/Summary";
import { sourceLabel, timeAgo } from "@/components/format";
import styles from "./StoryCard.module.css";

/** One story row: vote rail + editorial body (kicker, headline, dek, meta, AI brief). */
export default function StoryCard({ story }: { story: FeedStory }) {
  return (
    <article className={styles.card}>
      <Vote articleId={story.id} initial={story.userVote} score={story.score} />

      <div className={styles.body}>
        <div className={styles.kicker}>
          <span className={styles.source}>{sourceLabel(story.source)}</span>
          {story.sourceCount > 1 && (
            <span className={styles.chip}>{story.sourceCount} sources</span>
          )}
        </div>

        <a className={styles.headline} href={story.canonicalUrl} target="_blank" rel="noopener noreferrer">
          {story.title}
        </a>

        {story.summary && <p className={styles.dek}>{story.summary}</p>}

        <div className={styles.meta}>
          <span>{timeAgo(story.publishedAt)}</span>
          {story.topics.map((t) => (
            <span key={t} className={styles.topic}>
              #{t}
            </span>
          ))}
        </div>

        {story.others.length > 0 && (
          <p className={styles.also}>
            Also covered by:{" "}
            {story.others.map((o, i) => (
              <span key={o.url}>
                {i > 0 && ", "}
                <a href={o.url} target="_blank" rel="noopener noreferrer">
                  {sourceLabel(o.source)}
                </a>
              </span>
            ))}
          </p>
        )}

        <Summary articleId={story.id} initial={story.detailSummary} />
      </div>
    </article>
  );
}
