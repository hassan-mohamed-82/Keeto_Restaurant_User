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

/**
 * user_points_transactions
 * -------------------------
 * Full audit trail for every point earned or redeemed by a user.
 */
export const userPointsTransactions = mysqlTable("user_points_transactions", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),

    userId: char("user_id", { length: 36 })
        .references(() => users.id)
        .notNull(),

    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id)
        .notNull(),

    /** "earn" when order delivered, "redeem" when OTP created */
    type: mysqlEnum("type", ["earn", "redeem"]).notNull(),

    /** Number of points earned (+) or redeemed (-) */
    points: int("points").notNull(),

    balanceBefore: int("balance_before").notNull(),
    balanceAfter: int("balance_after").notNull(),

    /** Linked to an order (for earn transactions) */
    orderId: char("order_id", { length: 36 }),

    /** Linked to a redemption (for redeem transactions) */
    redemptionId: char("redemption_id", { length: 36 }),

    note: varchar("note", { length: 255 }),

    createdAt: timestamp("created_at").defaultNow(),
});
