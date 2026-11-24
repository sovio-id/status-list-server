import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import { statusListsTable } from "../schema";

export type StatusListFormat = "token" | "bitstring";

export type NewStatusList = {
  id: string;
  status_list: string;
  format: StatusListFormat;
};

export async function insertStatusList(data: NewStatusList) {
  await db.insert(statusListsTable).values({
    id: data.id,
    status_list: data.status_list,
    format: data.format,
  });
}

export async function getStatusListById(id: string) {
  return db
    .select()
    .from(statusListsTable)
    .where(eq(statusListsTable.id, id))
    .get();
}

export async function statusListExists(id: string) {
  const row = await db
    .select({ id: statusListsTable.id })
    .from(statusListsTable)
    .where(eq(statusListsTable.id, id))
    .get();
  return row !== undefined;
}

export async function updateStatusList(
  id: string,
  statusList: string,
  expectedVersion?: number,
) {
  const where =
    expectedVersion === undefined
      ? eq(statusListsTable.id, id)
      : and(
          eq(statusListsTable.id, id),
          eq(statusListsTable.version, expectedVersion),
        );

  const rows = await db
    .update(statusListsTable)
    .set({
      status_list: statusList,
      version: sql`${statusListsTable.version} + 1`,
    })
    .where(where)
    .returning({ version: statusListsTable.version });

  return rows[0];
}
