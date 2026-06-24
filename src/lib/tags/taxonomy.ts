/**
 * Seed taxonomy for Phase 6 tagging. Each topic maps to a keyword list matched
 * against an article's title + summary. This covers the common, well-understood
 * topics for FREE (no AI). Anything that matches none of these falls through to
 * the AI layer, which can reuse a topic here or coin a brand-new one — so the
 * vocabulary GROWS beyond this seed over time.
 *
 * Topics are stored as kebab-case strings (the same convention the AI follows),
 * so keyword tags and AI tags share one namespace.
 */
export const TAXONOMY: Record<string, string[]> = {
  technology: [
    "technology", "tech", "software", "hardware", "ai", "artificial intelligence",
    "machine learning", "app", "startup", "chip", "semiconductor", "gadget",
    "smartphone", "iphone", "android", "cloud", "cybersecurity", "cyber", "robot",
    "programming", "developer", "open source", "gpu", "data center", "quantum", "claude", "chatgpt",
    "gemini", "openai"
  ],
  politics: [
    "election", "parliament", "government", "minister", "senate", "policy",
    "vote", "voters", "congress", "labor", "coalition", "prime minister",
    "president", "campaign", "referendum", "lawmaker", "cabinet", "diplomacy",
  ],
  business: [
    "business", "company", "earnings", "revenue", "ceo", "merger", "acquisition",
    "profit", "startup funding", "valuation", "quarterly results", "corporate",
  ],
  markets: [
    "stock", "stocks", "market", "markets", "sensex", "nifty", "nasdaq", "dow",
    "s&p", "shares", "equity", "equities", "bond", "bonds", "ipo", "futures",
    "rupee", "dollar", "rally", "sell-off", "selloff", "index", "trading",
    "wall street", "commodities", "crude", "gold price",
  ],
  economy: [
    "economy", "economic", "inflation", "gdp", "recession", "interest rate",
    "interest rates", "central bank", "fed", "rba", "rbi", "unemployment rate",
    "budget", "fiscal", "monetary", "tariff", "trade deal",
  ],
  sport: [
    "cricket", "football", "soccer", "tennis", "rugby", "olympics", "match",
    "tournament", "league", "world cup", "afl", "nrl", "ipl", "ashes", "final",
  ],
  immigration: [
    "visa", "visas", "immigration", "migration", "migrant", "immigrant",
    "citizenship", "border", "asylum", "refugee", "deportation", "permanent residency",
    "invitation round", "subclass", "skillselect", "eoi", "points test", "sponsorship",
    "skilled migration", "189", "190", "491", "482", "student visa", "pr",
  ],
  australia: [
    "australia", "australian", "sydney", "melbourne", "canberra", "brisbane",
    "perth", "adelaide", "queensland", "nsw", "victoria", "tasmania", "aussie",
    "albanese", "centrelink", "medicare",
  ],
  india: [
    "india", "indian", "delhi", "mumbai", "bengaluru", "bangalore", "kolkata",
    "chennai", "modi", "bjp", "lok sabha", "reserve bank of india", "rupee"
  ],
  jobs: [
    "job", "jobs", "hiring", "layoff", "layoffs", "redundancy", "redundancies",
    "employment", "salary", "salaries", "recruitment", "workforce", "vacancy",
    "career", "unemployment", "wages", "labour market", "labor market", "job market", "IT jobs"
  ],
};

/** All seed topic names (used to prime the AI prompt's known-tags list). */
export const SEED_TOPICS = Object.keys(TAXONOMY);
