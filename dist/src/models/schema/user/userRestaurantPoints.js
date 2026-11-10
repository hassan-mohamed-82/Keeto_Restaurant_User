"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRestaurantPoints = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const Users_1 = require("./Users");
const restaurants_1 = require("../admin/restaurants");
exports.userRestaurantPoints = (0, mysql_core_1.mysqlTable)("user_restaurant_points", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    userId: (0, mysql_core_1.char)("user_id", { length: 36 })
        .references(() => Users_1.users.id, { onDelete: "cascade" })
        .notNull(),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id, { onDelete: "cascade" })
        .notNull(),
    points: (0, mysql_core_1.int)("points").default(0).notNull(),
    totalOrders: (0, mysql_core_1.int)("total_orders").default(0).notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
}, (table) => ({
    userRestIdx: (0, mysql_core_1.uniqueIndex)("unique_user_restaurant_points").on(table.userId, table.restaurantId),
}));
