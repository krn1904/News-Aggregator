import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { authConfig } from "./auth.config";

function configuredOAuthProviders() {
  const providers = [];

  // Google/GitHub verify email ownership, so linking OAuth to an existing
  // credentials account with the same email is safe for this app.
  const linkByEmail = { allowDangerousEmailAccountLinking: true as const };

  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
    providers.push(Google(linkByEmail));
  }

  if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
    providers.push(GitHub(linkByEmail));
  }

  return providers;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: "jwt",
  },
  providers: [
    ...configuredOAuthProviders(),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email =
          typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const [user] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            image: users.image,
            passwordHash: users.passwordHash,
          })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user?.passwordHash) return null;
        const valid = await compare(password, user.passwordHash);
        if (!valid || !user.email) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      if (user?.email) {
        token.email = user.email;
        token.isAdmin = isAdminEmail(user.email);
      }
      if (user?.name) token.name = user.name;
      if (user?.image) token.picture = user.image;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (typeof token.id === "string") session.user.id = token.id;
        if (typeof token.email === "string") session.user.email = token.email;
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof token.picture === "string") session.user.image = token.picture;
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
});
