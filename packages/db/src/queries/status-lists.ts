import { eq } from "drizzle-orm";
import { db } from "../index";
import { statusListsTable } from "../schema";

export type NewStatusList = {
  id: string;
  status_list: string;
};

export async function insertStatusList(data: NewStatusList) {
  await db.insert(statusListsTable).values({
    id: data.id,
    status_list: data.status_list,
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

export async function updateStatusList(id: string, jwt: string) {
  await db
    .update(statusListsTable)
    .set({ status_list: jwt })
    .where(eq(statusListsTable.id, id));
}
