import {
    mysqlTable,
    varchar,
    char,
    timestamp,
    boolean,
    uniqueIndex,
    json,
} from "drizzle-orm/mysql-core";
import { sql, relations } from "drizzle-orm";
import { restaurants } from "./restaurants";
import { branches } from "./branches";

export const captainOrders = mysqlTable(
    "captain_orders",
    {
        id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
        restaurantId: char("restaurant_id", { length: 36 })
            .references(() => restaurants.id, { onDelete: "cascade" })
            .notNull(),
        branchId: char("branch_id", { length: 36 })
            .references(() => branches.id, { onDelete: "cascade" })
            .notNull(),
        name: varchar("name", { length: 255 }).notNull(),
        userName: varchar("user_name", { length: 255 }).notNull(),
        phone: varchar("phone", { length: 50 }).notNull(),
        password: varchar("password", { length: 255 }).notNull(),
        image: varchar("image", { length: 500 }),
        hallIds: json("hall_ids").$type<string[]>().default([]).notNull(),
        status: boolean("status").default(true).notNull(),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    },
    (table) => ({
        restaurantUserNameIdx: uniqueIndex("uk_captain_orders_restaurant_user_name").on(
            table.restaurantId,
            table.userName
        ),
        restaurantPhoneIdx: uniqueIndex("uk_captain_orders_restaurant_phone").on(
            table.restaurantId,
            table.phone
        ),
    })
);

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
