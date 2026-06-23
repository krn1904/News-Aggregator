import { NextRequest, NextResponse } from "next/server";
import { clampLimit, getFeed } from "@/lib/feed";

/**
 * Read-back. Returns stored stories (clusters collapsed) newest-first. No
 * personalization yet — ranking arrives in Phase 8. Public (read-only).
 *
 * Query: `?limit=` (default 20, max 100), `?offset=` (for pagination).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = clampLimit(req.nextUrl.searchParams.get("limit"));
  const offset = Math.max(0, Math.trunc(Number(req.nextUrl.searchParams.get("offset")) || 0));

  try {
    const rows = await getFeed(limit, offset);
    return NextResponse.json({ ok: true, count: rows.length, articles: rows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
