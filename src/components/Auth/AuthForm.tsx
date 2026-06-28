"use client";

import { useActionState } from "react";
import type { AuthFormState } from "@/lib/auth-actions";
import styles from "@/app/(auth)/auth.module.css";

type Props = {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
};

const initialState: AuthFormState = { error: null };

export default function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const isSignup = mode === "signup";

  return (
    <form action={formAction} className={styles.form}>
      {isSignup && (
        <label className={styles.field}>
          Name
          <input className={styles.input} name="name" autoComplete="name" />
        </label>
      )}

      <label className={styles.field}>
        Email
        <input className={styles.input} name="email" type="email" autoComplete="email" required />
      </label>

      <label className={styles.field}>
        Password
        <input
          className={styles.input}
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={8}
          required
        />
      </label>

      {state.error && <p className={styles.error}>{state.error}</p>}

      <button className={styles.button} type="submit" disabled={pending}>
        {pending ? "Working..." : isSignup ? "Create account" : "Sign in"}
      </button>
    </form>
  );
}
