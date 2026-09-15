import {
    mysqlTable,
    varchar,
    char,
    timestamp,
    decimal,
    boolean,
} from "drizzle-orm/mysql-core";
import { sql, relations } from "drizzle-orm";
import { restaurants } from "./restaurants";

export const suppliers = mysqlTable("suppliers", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id, { onDelete: "cascade" })
        .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }).notNull(),
    balance: decimal("balance", { precision: 10, scale: 2 }).default("0.00").notNull(),
    status: boolean("status").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const suppliersRelations = relations(suppliers, ({ one }) => ({
    restaurant: one(restaurants, {
        fields: [suppliers.restaurantId],
        references: [restaurants.id],
    }),
}));

export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
