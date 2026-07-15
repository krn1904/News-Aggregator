import ThemeToggle from "@/components/ThemeToggle/ThemeToggle";
import PollButton from "@/components/PollButton/PollButton";
import styles from "./Masthead.module.css";
import { auth, signOut } from "../../../auth";
import { isAdminEmail } from "@/lib/admin";

/** The editorial masthead: wordmark + tagline, theme/poll controls, dated sub-bar. */
export default async function Masthead() {
  const session = await auth();
  const user = session?.user;
  const isLoggedIn = Boolean(user?.id);
  const accountLabel = user?.email ?? user?.name ?? null;
  const isAdmin = isAdminEmail(user?.email ?? null);
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
            <h1 className={styles.wordmark}>Brief</h1>
            <p className={styles.tagline}>your feed, learned one read at a time</p>
          </div>
          <div className={styles.actions}>
            {isLoggedIn && (
              <div className={styles.account}>
                {accountLabel && <span className={styles.email}>{accountLabel}</span>}
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button className={styles.signOut} type="submit">
                    Sign out
                  </button>
                </form>
              </div>
            )}
            <ThemeToggle />
            {isAdmin && <PollButton />}
          </div>
        </div>

        <div className={styles.rule} />

        <div className={styles.subbar}>
          <span>Your Feed · Personalized</span>
          <span>Fresh stories fetched by scheduled workflow</span>
          <span>{today}</span>
        </div>
      </div>
    </header>
  );
}
