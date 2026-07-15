import type { NextAuthConfig } from "next-auth";

export const PUBLIC_PATHS = ["/login", "/signup", "/api/auth", "/api/poll", "/api/health"];

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl;
      const isPublic = PUBLIC_PATHS.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
      );
      if (isPublic) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
