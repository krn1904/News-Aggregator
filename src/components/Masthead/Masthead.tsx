import ThemeToggle from "@/components/ThemeToggle/ThemeToggle";
import PollButton from "@/components/PollButton/PollButton";
import styles from "./Masthead.module.css";

/** The editorial masthead: wordmark + tagline, theme/poll controls, dated sub-bar. */
export default function Masthead() {
  const today = new Date()
    .toLocaleDateString("en-AU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();

  return (
    <header className={styles.masthead}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div>
            <h1 className={styles.wordmark}>Dispatch</h1>
            <p className={styles.tagline}>your feed, learned one read at a time</p>
          </div>
          <div className={styles.actions}>
            <ThemeToggle />
            <PollButton />
          </div>
        </div>

        <div className={styles.rule} />

        <div className={styles.subbar}>
          <span>Your Feed · Personalized</span>
          <span>{today}</span>
        </div>
      </div>
    </header>
  );
}
