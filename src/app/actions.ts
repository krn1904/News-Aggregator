"use server";

import { revalidatePath } from "next/cache";
import { ingestAllSources } from "@/lib/ingest";

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
    }
  | { status: "error"; message: string };

export async function pollNow(): Promise<PollState> {
  try {
    const { totals, clustering } = await ingestAllSources();
    revalidatePath("/");
    return {
      status: "ok",
      fetched: totals.fetched,
      inserted: totals.inserted,
      skipped: totals.skipped,
      failed: totals.failed,
      grouped: clustering.clustersMatched,
    };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
