import {
    mysqlTable,
    varchar,
    char,
    timestamp,
    boolean,
    int,
} from "drizzle-orm/mysql-core";
import { sql, relations } from "drizzle-orm";
import { restaurants } from "./restaurants";
import { halls } from "./hall";

export const hallTables = mysqlTable("hall_tables", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id, { onDelete: "cascade" })
        .notNull(),
    hallId: char("hall_id", { length: 36 })
        .references(() => halls.id, { onDelete: "cascade" })
        .notNull(),
    tblNumber: varchar("tbl_number", { length: 50 }).notNull(),
    capacity: int("capacity").default(1).notNull(),
    qr: varchar("qr", { length: 500 }).notNull(),
    occupied: boolean("occupied").default(false).notNull(),
    status: boolean("status").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const hallTablesRelations = relations(hallTables, ({ one }) => ({
    restaurant: one(restaurants, {
        fields: [hallTables.restaurantId],
        references: [restaurants.id],
    }),
    hall: one(halls, {
        fields: [hallTables.hallId],
        references: [halls.id],
    }),
}));

export type HallTable = typeof hallTables.$inferSelect;
export type NewHallTable = typeof hallTables.$inferInsert;
