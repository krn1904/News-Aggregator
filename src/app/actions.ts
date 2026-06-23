"use server";

import { revalidatePath } from "next/cache";
import { ingestHackerNews } from "@/lib/ingest";

/**
 * "Poll now" server action for the feed page. Runs server-side, so it calls the
 * ingest logic directly — no POLL_SECRET needed (that secret only guards the
 * public HTTP route the scheduled poller hits). Refreshes the feed afterward.
 */
export type PollState =
  | { status: "idle" }
  | { status: "ok"; fetched: number; inserted: number; skipped: number }
  | { status: "error"; message: string };

export async function pollNow(): Promise<PollState> {
  try {
    const r = await ingestHackerNews();
    revalidatePath("/");
    return { status: "ok", fetched: r.fetched, inserted: r.inserted, skipped: r.skipped };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
