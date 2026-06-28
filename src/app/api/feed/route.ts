import { NextRequest, NextResponse } from "next/server";
import { clampLimit, getFeed } from "@/lib/feed";
import { auth } from "../../../../auth";

/**
 * Read-back. Returns stored stories (clusters collapsed) ranked for the signed-
 * in user.
 *
 * Query: `?limit=` (default 20, max 100), `?offset=` (for pagination).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = clampLimit(req.nextUrl.searchParams.get("limit"));
  const offset = Math.max(0, Math.trunc(Number(req.nextUrl.searchParams.get("offset")) || 0));
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  try {
    const rows = await getFeed(userId, limit, offset);
    return NextResponse.json({ ok: true, count: rows.length, articles: rows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
