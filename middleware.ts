import { NextResponse } from "next/server";
import { auth } from "./auth";

const PUBLIC_PATHS = ["/login", "/signup", "/api/auth", "/api/poll", "/api/health"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (isPublic || req.auth) return NextResponse.next();

  const login = new URL("/login", req.nextUrl);
  login.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
