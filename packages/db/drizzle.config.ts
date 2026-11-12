import { resolve } from "node:path";

import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
  path: [
    resolve(process.cwd(), "apps/server/.env"),
    resolve(process.cwd(), "../../apps/server/.env"),
  ],
});

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
