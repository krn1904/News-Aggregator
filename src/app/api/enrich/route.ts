import { NextRequest, NextResponse } from "next/server";
import { enrichArticle } from "@/lib/enrich";
import { auth } from "../../../../auth";

/**
 * Phase 9. Generates (or returns the cached) AI summary for an article.
 * Body: `{ articleId: number }`. On-demand only — called when the user clicks
 * "Summarize". Phase 11 requires a signed-in user so later AI limits can be
 * enforced per account.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gemini fetches + reads the page, which can take a while.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { articleId?: unknown };
    const articleId = Number(body.articleId);
    if (!Number.isInteger(articleId)) {
      return NextResponse.json(
        { ok: false, error: "Body must be { articleId: integer }" },
        { status: 400 }
      );
    }

    const result = await enrichArticle(articleId);
    return NextResponse.json({ ok: result.status === "enriched", ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
