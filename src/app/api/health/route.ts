import { NextResponse } from "next/server";

// Liveness probe — no DB touched. Proves the app is deployed and serving.
export async function GET() {
  return NextResponse.json({ ok: true, service: "news-aggregator", ts: Date.now() });
}
