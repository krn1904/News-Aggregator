import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import AuthForm from "@/components/Auth/AuthForm";
import { signInWithGitHub, signInWithGoogle, signupWithCredentials } from "@/lib/auth-actions";
import { authErrorMessage } from "@/lib/auth-errors";
import styles from "../auth.module.css";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function SignupPage({ searchParams }: Props) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { error } = await searchParams;
  const oauthError = authErrorMessage(error);
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const githubEnabled = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);
  const hasOAuth = googleEnabled || githubEnabled;

  return (
    <section className={styles.shell}>
      <div className={styles.panel}>
        <h2 className={styles.title}>Create account</h2>
        <p className={styles.dek}>Start with a neutral feed, then teach it with votes.</p>

        {oauthError && <p className={styles.error}>{oauthError}</p>}

        <AuthForm mode="signup" action={signupWithCredentials} />

        {hasOAuth && (
          <>
            <div className={styles.divider} />
            <div className={styles.oauthGrid}>
              {googleEnabled && (
                <form action={signInWithGoogle}>
                  <button className={styles.oauth} type="submit">
                    Google
                  </button>
                </form>
              )}
              {githubEnabled && (
                <form action={signInWithGitHub}>
                  <button className={styles.oauth} type="submit">
                    GitHub
                  </button>
                </form>
              )}
            </div>
          </>
        )}

        <p className={styles.switch}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
        <p className={styles.learn}>
          <Link href="/how-it-works">How Brief works &rarr;</Link>
        </p>
      </div>
    </section>
  );
}
