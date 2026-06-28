import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js loads `.env.local` automatically, but drizzle-kit (run via node/tsx)
// does not, so load it here (falling back to `.env`).
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Only needed for `db:migrate`/`db:push`; `db:generate` works offline.
    url: process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/db",
  },
});
