import { Database } from "bun:sqlite";
import postgres from "postgres";

type SqliteStatusListRow = {
  id: string;
  status_list: string;
  format: string | null;
  version: number;
  created_at: number | string;
  updated_at: number | string;
};

const sqlitePath = process.env.SQLITE_DB_PATH ?? "local.db";
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const sqlite = new Database(sqlitePath, { readonly: true });
const target = postgres(databaseUrl);

const rows = sqlite
  .query<SqliteStatusListRow>(
    "SELECT id, status_list, format, version, created_at, updated_at FROM status_lists",
  )
  .all();

const toIso = (value: number | string): string => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) {
    return new Date(numeric * 1000).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
};

try {
  await target.begin(async (tx) => {
    for (const row of rows) {
      await tx`
        INSERT INTO status_lists (
          id,
          status_list,
          format,
          version,
          created_at,
          updated_at
        ) VALUES (
          ${row.id},
          ${row.status_list},
          ${row.format || "token"},
          ${row.version},
          ${toIso(row.created_at)},
          ${toIso(row.updated_at)}
        )
        ON CONFLICT (id) DO UPDATE SET
          status_list = EXCLUDED.status_list,
          format = EXCLUDED.format,
          version = EXCLUDED.version,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at
      `;
    }
  });

  const result = await target<Array<{ count: string }>>`
    SELECT COUNT(*)::text AS count FROM status_lists
  `;
  const destinationCount = Number(result[0]?.count ?? 0);

  if (destinationCount < rows.length) {
    throw new Error(
      `Destination row count mismatch: expected at least ${rows.length}, got ${destinationCount}`,
    );
  }

  console.log(
    `Migrated ${rows.length} status list(s); destination has ${destinationCount} row(s).`,
  );
} finally {
  sqlite.close();
  await target.end();
}
