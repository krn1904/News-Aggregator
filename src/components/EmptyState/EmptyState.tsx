import PollButton from "@/components/PollButton/PollButton";
import styles from "./EmptyState.module.css";

/** Shown when the feed is empty — invites the first poll. */
export default function EmptyState() {
  return (
    <div className={styles.empty}>
      <div className={styles.placeholder}>no feed yet</div>
      <h2 className={styles.headline}>Nothing in your feed.</h2>
      <p className={styles.sub}>
        Pull the latest from Hacker News, the Guardian, Economic Times &amp; Livemint. The more you
        vote, the more it learns.
      </p>
      <PollButton />
    </div>
  );
}
