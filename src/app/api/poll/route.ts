import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/db";
import { articles } from "@/db/schema";
import { fetchHackerNews } from "@/lib/sources/hackernews";

/**
 * Phase 2 ingest job. Fetches one source (Hacker News), normalizes, and stores
 * new articles. Idempotent: a unique `canonical_url` + ON CONFLICT DO NOTHING
 * means re-running inserts 0 duplicates. Called manually now; by a scheduled
 * GitHub Action from Phase 3, authenticated with POLL_SECRET.
 *
 * Auth: `Authorization: Bearer <POLL_SECRET>`.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.POLL_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  // Length check first; timingSafeEqual throws on unequal-length buffers.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.POLL_SECRET) {
    return NextResponse.json(
      { ok: false, error: "POLL_SECRET is not configured on the server." },
      { status: 500 }
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const items = await fetchHackerNews();
    const fetched = items.length;

    if (fetched === 0) {
      return NextResponse.json({ ok: true, source: "hackernews", fetched: 0, inserted: 0, skipped: 0 });
    }

    // Only new canonical URLs land; existing ones are silently skipped.
    const insertedRows = await db
      .insert(articles)
      .values(items)
      .onConflictDoNothing({ target: articles.canonicalUrl })
      .returning({ id: articles.id });

    const inserted = insertedRows.length;
    return NextResponse.json({
      ok: true,
      source: "hackernews",
      fetched,
      inserted,
      skipped: fetched - inserted,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
