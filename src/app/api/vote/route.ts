import { NextRequest, NextResponse } from "next/server";
import { castVote } from "@/lib/vote";

/**
 * Phase 7. Records a thumbs up/down on an article and updates topic interest.
 * Body: `{ articleId: number, value: 1 | -1 }`. Toggle semantics (voting the
 * same way again clears it). Single-user app — public, no auth.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { articleId?: unknown; value?: unknown };
    const articleId = Number(body.articleId);
    const value = Number(body.value);
    if (!Number.isInteger(articleId) || (value !== 1 && value !== -1)) {
      return NextResponse.json(
        { ok: false, error: "Body must be { articleId: integer, value: 1 | -1 }" },
        { status: 400 }
      );
    }

    const result = await castVote(articleId, value as 1 | -1);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
