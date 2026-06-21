import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Only needed for `db:migrate`/`db:push`; `db:generate` works offline.
    url: process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/db",
  },
});
