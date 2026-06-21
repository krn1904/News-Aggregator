/**
 * Database client. Uses Neon's HTTP driver, which is built for serverless:
 * each request is a stateless HTTP call, so we never exhaust a connection
 * pool the way a classic TCP `pg` client would on Vercel.
 *
 * Requires env var DATABASE_URL (Neon *pooled* connection string).
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

const sql = neon(connectionString);
export const db = drizzle(sql, { schema });
export { schema };
