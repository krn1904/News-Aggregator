import { NextRequest, NextResponse } from "next/server";
import { clampLimit, getFeed } from "@/lib/feed";

/**
 * Phase 2 read-back. Returns stored articles newest-first. No personalization
 * yet — ranking by learned interest arrives in Phase 7. Public (read-only).
 *
 * Query: `?limit=` (default 50, max 100).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = clampLimit(req.nextUrl.searchParams.get("limit"));

  try {
    const rows = await getFeed(limit);
    return NextResponse.json({ ok: true, count: rows.length, articles: rows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
