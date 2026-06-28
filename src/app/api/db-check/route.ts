import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Acceptance test. Round-trips a harmless sentinel Auth.js user to prove
 * migrations ran and the app can read+write Neon.
 * Idempotent: upserts a single `__db_check__` row.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db
      .insert(users)
      .values({ id: "__db_check__", email: "__db_check__@local.test", name: "DB Check" })
      .onConflictDoUpdate({
        target: users.id,
        set: { name: sql`'DB Check'` },
      });

    const [row] = await db
      .select()
      .from(users)
      .where(sql`${users.id} = '__db_check__'`);

    return NextResponse.json({ ok: true, roundTrip: row });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
