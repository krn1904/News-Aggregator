"use client";

import { usePoll } from "@/components/PollProvider/PollProvider";
import styles from "./PollButton.module.css";

/** Masthead "Poll now" button. Triggers a poll via the shared PollProvider. */
export default function PollButton() {
  const { polling, runPoll } = usePoll();

  return (
    <button className={styles.poll} onClick={runPoll} disabled={polling}>
      {polling && <span className={styles.spinner} aria-hidden />}
      {polling ? "Polling…" : "Poll now"}
    </button>
  );
}
