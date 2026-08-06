import {
    mysqlTable,
    char,
    int,
    varchar,
    timestamp,
    mysqlEnum,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { users } from "../user/Users";
import { restaurants } from "./restaurants";
import { food } from "./food";

/**
 * points_redemptions
 * -------------------
 * A redemption request: the user spends points on a specific enrolled food.
 * The system issues a 6-digit OTP (expires in 3 min).
 * The admin scans / types the code → marks it "used" → product is issued.
 */
export const pointsRedemptions = mysqlTable("points_redemptions", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),

    userId: char("user_id", { length: 36 })
        .references(() => users.id)
        .notNull(),

    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id)
        .notNull(),

    foodId: char("food_id", { length: 36 })
        .references(() => food.id)
        .notNull(),

    /** The food.points value at the time of redemption */
    pointsCost: int("points_cost").notNull(),

    /** 6-digit OTP shown to user */
    code: varchar("code", { length: 6 }).notNull(),

    status: mysqlEnum("status", ["pending", "used", "expired"])
        .default("pending")
        .notNull(),

    /** 3 minutes after creation */
    expiresAt: timestamp("expires_at").notNull(),

    /** When the admin verified and used the code */
    usedAt: timestamp("used_at"),

    createdAt: timestamp("created_at").defaultNow(),
});
