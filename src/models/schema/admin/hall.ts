import {
    mysqlTable,
    varchar,
    char,
    timestamp,
    boolean,
} from "drizzle-orm/mysql-core";
import { sql, relations } from "drizzle-orm";
import { restaurants } from "./restaurants";
import { branches } from "./branches";
import { hallTables } from "./hallTable";

export const halls = mysqlTable("halls", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id, { onDelete: "cascade" })
        .notNull(),
    branchId: char("branch_id", { length: 36 })
        .references(() => branches.id, { onDelete: "cascade" })
        .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    nameAr: varchar("name_ar", { length: 255 }),
    nameFr: varchar("name_fr", { length: 255 }),
    lat: varchar("lat", { length: 255 }),
    lng: varchar("lng", { length: 255 }),
    status: boolean("status").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const hallsRelations = relations(halls, ({ one, many }) => ({
    restaurant: one(restaurants, {
        fields: [halls.restaurantId],
        references: [restaurants.id],
    }),
    branch: one(branches, {
        fields: [halls.branchId],
        references: [branches.id],
    }),
    tables: many(hallTables),
}));

export type Hall = typeof halls.$inferSelect;
export type NewHall = typeof halls.$inferInsert;
