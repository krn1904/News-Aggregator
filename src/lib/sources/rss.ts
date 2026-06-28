import { XMLParser } from "fast-xml-parser";
import type { RawArticle } from "./types";

/**
 * Generic RSS/Atom adapter. Most news portals publish RSS, so one parser covers
 * many sources — each feed is just a { name, url } entry in the registry.
 * Returns RAW articles; the central ingest step strips HTML + decodes entities.
 */

export type FeedDef = { name: string; url: string };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Some feeds wrap text in CDATA / use HTML entities — keep values as strings.
  textNodeName: "#text",
  // Passing processEntities as an object lifts fast-xml-parser's default 1000
  // total-entity-expansion cap (which big news feeds like Guardian AU exceed),
  // while keeping a high finite bound as billion-laughs protection.
  processEntities: { maxTotalExpansions: 1_000_000, maxEntityCount: 100_000, maxEntitySize: 1_000_000 },
});

/** Pull plain text out of a field that may be a string or a parser object. */
function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o["#text"] === "string") return o["#text"];
  }
  return "";
}

/** RSS <link> is a string; Atom <link> is (an array of) { @_href, @_rel }. */
function extractLink(item: Record<string, unknown>): string {
  const link = item.link;
  if (typeof link === "string") return link.trim();
  if (Array.isArray(link)) {
    const alt =
      link.find((l) => (l as Record<string, unknown>)["@_rel"] === "alternate") ?? link[0];
    const href = (alt as Record<string, unknown>)?.["@_href"];
    if (typeof href === "string") return href.trim();
  }
  if (link && typeof link === "object") {
    const href = (link as Record<string, unknown>)["@_href"];
    if (typeof href === "string") return href.trim();
  }
  // Fall back to guid/id if it looks like a URL.
  const guid = text(item.guid) || text(item.id);
  return /^https?:\/\//.test(guid) ? guid.trim() : "";
}

function parseDate(item: Record<string, unknown>): Date | null {
  const raw =
    text(item.pubDate) || // RSS 2.0
    text(item.published) || // Atom
    text(item.updated) || // Atom
    text(item["dc:date"]); // Dublin Core
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Fetch one RSS/Atom feed as raw articles (ingest does the cleaning + hashing). */
export async function fetchRss(def: FeedDef): Promise<RawArticle[]> {
  const res = await fetch(def.url, {
    headers: { accept: "application/rss+xml, application/xml, text/xml, */*", "user-agent": "news-aggregator/1.0" },
  });
  if (!res.ok) {
    throw new Error(`${def.name} fetch failed: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const doc = parser.parse(xml) as Record<string, any>;

  // RSS 2.0: rss.channel.item[]   |   Atom: feed.entry[]
  const items: Record<string, unknown>[] = doc?.rss?.channel?.item
    ? asArray(doc.rss.channel.item)
    : doc?.feed?.entry
      ? asArray(doc.feed.entry)
      : [];

  const out: RawArticle[] = [];
  for (const item of items) {
    const title = text(item.title).trim();
    const canonicalUrl = extractLink(item);
    if (!title || !canonicalUrl) continue; // skip malformed entries

    // Raw blurb (HTML/entities and all) — ingest's normalizeArticle cleans it.
    const summary =
      text(item.description) || text(item.summary) || text(item["content:encoded"]) || null;

    out.push({
      source: def.name,
      title,
      canonicalUrl,
      summary,
      publishedAt: parseDate(item),
    });
  }

  // De-dup within this batch (Postgres ON CONFLICT DO NOTHING won't collapse
  // duplicate keys inside a single INSERT statement).
  const seen = new Set<string>();
  return out.filter((a) =>
    seen.has(a.canonicalUrl) ? false : (seen.add(a.canonicalUrl), true)
  );
}
