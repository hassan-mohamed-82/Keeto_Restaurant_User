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
// export const userPointsTransactions = mysqlTable("user_points_transactions", {
//     id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
//     userId: char("user_id", { length: 36 })
//         .references(() => users.id, { onDelete: "cascade" })
//         .notNull(),
//     restaurantId: char("restaurant_id", { length: 36 })
//         .references(() => restaurants.id, { onDelete: "cascade" })
//         .notNull(),
//     type: mysqlEnum("type", [
//         "earn",          // كسب نقاط عند استلام الطلب
//         "redeem",        // استبدال نقاط بوجبة
//         "manual_adjust"  // تعديل يدوي من الإدارة
//     ]).notNull(),
//     points: int("points").notNull(),
//     balanceBefore: int("balance_before").notNull(),
//     balanceAfter: int("balance_after").notNull(),
//     orderId: char("order_id", { length: 36 })
//         .references(() => orders.id, { onDelete: "set null" }),
//     note: varchar("note", { length: 255 }),
//     createdAt: timestamp("created_at").defaultNow(),
// }, (table) => ({
//     userIdx: index  ("user_points_tx_user_idx").on(table.userId),
//     restIdx: index("user_points_tx_rest_idx").on(table.restaurantId),
// }));
