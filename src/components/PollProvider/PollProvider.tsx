"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { pollNow, type PollState } from "@/app/actions";

/**
 * Shares poll state between the masthead button (which triggers a poll) and the
 * feed (which shows skeletons while polling and refreshes after). Lives in the
 * layout shell so both subtrees can read it.
 */
type PollContext = {
  polling: boolean;
  result: Extract<PollState, { status: "ok" }> | null;
  runPoll: () => void;
};

const Ctx = createContext<PollContext | null>(null);

export function usePoll(): PollContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePoll must be used inside <PollProvider>");
  return ctx;
}

export default function PollProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<PollContext["result"]>(null);

  function runPoll() {
    if (polling) return;
    setPolling(true);
    void (async () => {
      try {
        const r = await pollNow();
        setResult(r.status === "ok" ? r : null);
        router.refresh(); // re-run the server page → fresh ranked feed
      } finally {
        setPolling(false);
      }
    })();
  }

  return <Ctx.Provider value={{ polling, result, runPoll }}>{children}</Ctx.Provider>;
}
