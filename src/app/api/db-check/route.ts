import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { topicInterest } from "@/db/schema";

/**
 * Phase 1 acceptance test. Round-trips a harmless sentinel row through
 * `topic_interest` to prove migrations ran and the app can read+write Neon.
 * Idempotent: upserts a single `__db_check__` row, never pollutes real data.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db
      .insert(topicInterest)
      .values({ topic: "__db_check__", score: 1 })
      .onConflictDoUpdate({
        target: topicInterest.topic,
        set: { updatedAt: sql`now()` },
      });

    const [row] = await db
      .select()
      .from(topicInterest)
      .where(sql`${topicInterest.topic} = '__db_check__'`);

    return NextResponse.json({ ok: true, roundTrip: row });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
