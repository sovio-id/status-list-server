import { createClient } from "@libsql/client";
import { env } from "@status-list-server/env/server";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

const client = createClient({
  url: env.DATABASE_URL,
});

export const db = drizzle({ client, schema });
