import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export async function runMigrations() {
  dotenv.config({
    path: [
      resolve(process.cwd(), "apps/server/.env"),
      resolve(process.cwd(), "../../apps/server/.env"),
    ],
  });

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
    });
  } finally {
    await client.end();
  }
}

export default async function setup() {
  await runMigrations();
}

if (import.meta.main) {
  await runMigrations();
}
