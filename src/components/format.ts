/** Small presentation helpers shared by the feed components. */

export function timeAgo(d: Date | string | null): string {
  if (!d) return "unknown time";
  const secs = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** "guardian-australia" → "Guardian Australia" for display. */
export function sourceLabel(source: string): string {
  return source
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
