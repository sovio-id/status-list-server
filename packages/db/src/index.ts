import { createClient } from "@libsql/client";
import { env } from "@status-list-server/env/server";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "./schema";

export * from "./queries/status-lists";
export * from "./schema";

const client = createClient({
  url: env.DATABASE_URL,
});

export const db = drizzle({ client, schema });

await migrate(db, { migrationsFolder: new URL("./migrations", import.meta.url).pathname });
