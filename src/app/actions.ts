"use server";

import { revalidatePath } from "next/cache";
import { ingestAllSources } from "@/lib/ingest";
import { isAdminEmail } from "@/lib/admin";
import { auth } from "../../auth";

/**
 * "Poll now" server action for the feed page. Runs server-side, so it calls the
 * ingest logic directly — no POLL_SECRET needed (that secret only guards the
 * public HTTP route the scheduled poller hits). Refreshes the feed afterward.
 */
export type PollState =
  | { status: "idle" }
  | {
      status: "ok";
      fetched: number;
      inserted: number;
      skipped: number;
      failed: number;
      grouped: number; // articles attached to an existing/earlier cluster
      tagged: number; // articles tagged this run (keyword + AI)
    }
  | { status: "error"; message: string };

export async function pollNow(): Promise<PollState> {
  try {
    const session = await auth();
    if (!isAdminEmail(session?.user?.email)) {
      return { status: "error", message: "Admin access required." };
    }

    const { totals, clustering, tagging } = await ingestAllSources();
    revalidatePath("/");
    return {
      status: "ok",
      fetched: totals.fetched,
      inserted: totals.inserted,
      skipped: totals.skipped,
      failed: totals.failed,
      grouped: clustering.clustersMatched,
      tagged: tagging.keywordTagged + tagging.aiTagged,
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
