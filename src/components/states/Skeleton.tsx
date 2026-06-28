import styles from "./Skeleton.module.css";

/** A shimmering placeholder shaped like a StoryCard, shown while polling. */
export default function Skeleton() {
  return (
    <div className={styles.card} aria-hidden>
      <div className={styles.rail}>
        <span className={`${styles.block} ${styles.railStub}`} />
        <span className={`${styles.block} ${styles.railStub}`} />
      </div>
      <div className={styles.body}>
        <span className={`${styles.block} ${styles.kicker}`} />
        <span className={`${styles.block} ${styles.headline}`} />
        <span className={`${styles.block} ${styles.headlineShort}`} />
        <span className={`${styles.block} ${styles.dek}`} />
      </div>
    </div>
  );
}
