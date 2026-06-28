"use server";

import { AuthError } from "next-auth";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signIn } from "../../auth";

export type AuthFormState = { error: string | null };

const MIN_PASSWORD_LENGTH = 8;

export async function loginWithCredentials(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Email or password is incorrect." };
    }
    throw err;
  }
}

export async function signupWithCredentials(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !email.includes("@")) return { error: "Enter a valid email address." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: "An account already exists for that email." };

  const passwordHash = await hash(password, 12);
  await db.insert(users).values({
    name: name || null,
    email,
    passwordHash,
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Account created, but sign-in failed. Try logging in." };
    }
    throw err;
  }
}

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

export async function signInWithGitHub() {
  await signIn("github", { redirectTo: "/" });
}
