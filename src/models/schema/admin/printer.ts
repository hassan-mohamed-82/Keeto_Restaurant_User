import {
    mysqlTable,
    varchar,
    char,
    timestamp,
    mysqlEnum,
    int,
} from "drizzle-orm/mysql-core";
import { sql, relations } from "drizzle-orm";
import { restaurants } from "./restaurants";
import { branches } from "./branches";

export const printers = mysqlTable("printers", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id, { onDelete: "cascade" })
        .notNull(),
    branchId: char("branch_id", { length: 36 })
        .references(() => branches.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    ip: varchar("ip", { length: 100 }),
    port: int("port"),
    type: mysqlEnum("type", ["usb", "network"]).notNull().default("network"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const printersRelations = relations(printers, ({ one }) => ({
    restaurant: one(restaurants, {
        fields: [printers.restaurantId],
        references: [restaurants.id],
    }),
    branch: one(branches, {
        fields: [printers.branchId],
        references: [branches.id],
    }),
}));

export type Printer = typeof printers.$inferSelect;
export type NewPrinter = typeof printers.$inferInsert;
