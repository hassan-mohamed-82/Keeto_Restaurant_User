"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.favorites = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../../models/schema");
const schema_2 = require("../../models/schema");
const schema_3 = require("../../models/schema"); // مسار جدول الأكل
exports.favorites = (0, mysql_core_1.mysqlTable)("favorites", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    userId: (0, mysql_core_1.char)("user_id", { length: 36 }).references(() => schema_1.users.id).notNull(),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 }).references(() => schema_2.restaurants.id),
    foodId: (0, mysql_core_1.char)("food_id", { length: 36 }).references(() => schema_3.food.id),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
});
