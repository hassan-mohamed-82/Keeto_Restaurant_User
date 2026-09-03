"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pointsRedemptions = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const Users_1 = require("../user/Users");
const restaurants_1 = require("./restaurants");
const food_1 = require("./food");
/**
 * points_redemptions
 * -------------------
 * A redemption request: the user spends points on a specific enrolled food.
 * The system issues a 6-digit OTP (expires in 3 min).
 * The admin scans / types the code → marks it "used" → product is issued.
 */
exports.pointsRedemptions = (0, mysql_core_1.mysqlTable)("points_redemptions", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    userId: (0, mysql_core_1.char)("user_id", { length: 36 })
        .references(() => Users_1.users.id)
        .notNull(),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id)
        .notNull(),
    foodId: (0, mysql_core_1.char)("food_id", { length: 36 })
        .references(() => food_1.food.id)
        .notNull(),
    /** The food.points value at the time of redemption */
    pointsCost: (0, mysql_core_1.int)("points_cost").notNull(),
    /** 6-digit OTP shown to user */
    code: (0, mysql_core_1.varchar)("code", { length: 6 }).notNull(),
    status: (0, mysql_core_1.mysqlEnum)("status", ["pending", "used", "expired"])
        .default("pending")
        .notNull(),
    /** 3 minutes after creation */
    expiresAt: (0, mysql_core_1.timestamp)("expires_at").notNull(),
    /** When the admin verified and used the code */
    usedAt: (0, mysql_core_1.timestamp)("used_at"),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
});
