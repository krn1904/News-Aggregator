"use client";

import { useState, useTransition } from "react";
import { pollNow, type PollState } from "./actions";

/**
 * Triggers the `pollNow` server action and shows the result. On success the
 * action calls revalidatePath("/"), so the feed list below re-renders with the
 * newly ingested articles automatically.
 */
export default function PollButton() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<PollState>({ status: "idle" });

  function onClick() {
    startTransition(async () => {
      setState(await pollNow());
    });
  }

  return (
    <div>
      <button className="btn" onClick={onClick} disabled={pending}>
        {pending ? "Polling…" : "Poll now"}
      </button>

      {state.status === "ok" && (
        <p className="notice" role="status">
          Fetched {state.fetched} · inserted {state.inserted} new · skipped {state.skipped}{" "}
          duplicate{state.skipped === 1 ? "" : "s"}
          {state.grouped > 0 ? ` · ${state.grouped} grouped into existing stories` : ""}
          {state.tagged > 0 ? ` · ${state.tagged} tagged` : ""}
          {state.failed > 0 ? ` · ${state.failed} source${state.failed === 1 ? "" : "s"} failed` : ""}.
        </p>
      )}
      {state.status === "error" && (
        <p className="notice err" role="alert">
          Poll failed: {state.message}
        </p>
      )}
    </div>
  );
}
