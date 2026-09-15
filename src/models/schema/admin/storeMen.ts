import {
    mysqlTable,
    varchar,
    char,
    timestamp,
    boolean,
} from "drizzle-orm/mysql-core";
import { sql, relations } from "drizzle-orm";
import { restaurants } from "./restaurants";
import { stores } from "./stores";

export const storeMen = mysqlTable("store_men", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id, { onDelete: "cascade" })
        .notNull(),
    storeId: char("store_id", { length: 36 })
        .references(() => stores.id, { onDelete: "cascade" })
        .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }).notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    image: varchar("image", { length: 500 }),
    status: boolean("status").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const storeMenRelations = relations(storeMen, ({ one }) => ({
    restaurant: one(restaurants, {
        fields: [storeMen.restaurantId],
        references: [restaurants.id],
    }),
    store: one(stores, {
        fields: [storeMen.storeId],
        references: [stores.id],
    }),
}));

export type StoreMan = typeof storeMen.$inferSelect;
export type NewStoreMan = typeof storeMen.$inferInsert;
