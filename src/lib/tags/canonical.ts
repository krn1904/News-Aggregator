/**
 * Canonicalize AI-coined topics onto a single label, to fight vocabulary drift
 * (the AI sometimes invents near-synonyms: art / art-and-culture / culture).
 * Applied at write time so new tags stay canonical; run the matching one-time
 * merge SQL once to fix tags already in the DB. Extend `ALIASES` as drift shows.
 */
const ALIASES: Record<string, string> = {
  art: "culture",
  arts: "culture",
  "art-and-culture": "culture",
  "arts-and-culture": "culture",
  "public-health": "health",
  healthcare: "health",
  "health-care": "health",
};

export function canonicalize(topic: string): string {
  return ALIASES[topic] ?? topic;
}
