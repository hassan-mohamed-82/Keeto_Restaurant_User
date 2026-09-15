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

export const captainOrders = mysqlTable("captain_orders", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id, { onDelete: "cascade" })
        .notNull(),
    branchId: char("branch_id", { length: 36 })
        .references(() => branches.id, { onDelete: "cascade" })
        .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    userName: varchar("user_name", { length: 255 }).unique().notNull(),
    phone: varchar("phone", { length: 50 }).unique().notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    image: varchar("image", { length: 500 }),
    status: boolean("status").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const captainOrdersRelations = relations(captainOrders, ({ one }) => ({
    restaurant: one(restaurants, {
        fields: [captainOrders.restaurantId],
        references: [restaurants.id],
    }),
    branch: one(branches, {
        fields: [captainOrders.branchId],
        references: [branches.id],
    }),
}));

export type CaptainOrder = typeof captainOrders.$inferSelect;
export type NewCaptainOrder = typeof captainOrders.$inferInsert;
