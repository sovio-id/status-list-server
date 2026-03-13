import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const statusListsTable = sqliteTable("status_lists", {
  id: text("id").primaryKey(),
  status_list: text("status_list").notNull(),
  created_at: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(new Date()),
  updated_at: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(new Date())
    .$onUpdateFn(() => new Date()),
});
