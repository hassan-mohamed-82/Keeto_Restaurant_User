import { mysqlTable, char, int, timestamp, uniqueIndex, mysqlEnum, index, varchar } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { users } from "./Users";
import { restaurants } from "../admin/restaurants";
import { orders } from "../admin/order";

export const userRestaurantPoints = mysqlTable("user_restaurant_points", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),

    userId: char("user_id", { length: 36 })
        .references(() => users.id, { onDelete: "cascade" })
        .notNull(),

    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id, { onDelete: "cascade" })
        .notNull(),

    points: int("points").default(0).notNull(),
    totalOrders: int("total_orders").default(0).notNull(),

    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),

    createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
    userRestIdx: uniqueIndex("unique_user_restaurant_points").on(table.userId, table.restaurantId),
}));
