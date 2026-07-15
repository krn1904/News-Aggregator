import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Edge-safe middleware: auth.config has no DB/bcrypt imports.
export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
