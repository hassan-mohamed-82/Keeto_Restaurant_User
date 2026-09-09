import {
    mysqlTable,
    varchar,
    char,
    timestamp,
    time,
    boolean,
    mysqlEnum
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { restaurants } from "./restaurants";
import { branches } from "./branches";

export const shifts = mysqlTable("shifts", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantId: char("restaurant_id", { length: 36 }).references(() => restaurants.id, { onDelete: "cascade" }),
    branchId: char("branch_id", { length: 36 }).references(() => branches.id, { onDelete: "cascade" }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    nameAr: varchar("name_ar", { length: 255 }),
    nameFr: varchar("name_fr", { length: 255 }),
    from: time("from").notNull(),
    to: time("to").notNull(),
    isTomorrow: boolean("is_tomorrow").default(false).notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
