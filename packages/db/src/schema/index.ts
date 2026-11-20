import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const statusListsTable = pgTable("status_lists", {
  id: text("id").primaryKey(),
  status_list: text("status_list").notNull(),
  format: text("format").notNull().default("token"),
  version: integer("version").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});
