import { NextRequest, NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { articles } from "@/db/schema";

/**
 * Phase 2 read-back. Returns stored articles newest-first. No personalization
 * yet — ranking by learned interest arrives in Phase 7. Public (read-only).
 *
 * Query: `?limit=` (default 50, max 100).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;

  try {
    const rows = await db
      .select({
        id: articles.id,
        source: articles.source,
        title: articles.title,
        canonicalUrl: articles.canonicalUrl,
        summary: articles.summary,
        publishedAt: articles.publishedAt,
        fetchedAt: articles.fetchedAt,
      })
      .from(articles)
      // Newest published first; nulls last, then by fetch time as a tiebreaker.
      .orderBy(sql`${articles.publishedAt} DESC NULLS LAST`, desc(articles.fetchedAt))
      .limit(limit);

    return NextResponse.json({ ok: true, count: rows.length, articles: rows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
