import {
    mysqlTable,
    char,
    int,
    varchar,
    timestamp,
    mysqlEnum,
    index,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { users } from "../user/Users";
import { restaurants } from "./restaurants";
import { orders } from "./order";

/**
 * user_points_transactions
 * -------------------------
 * Full audit trail for every point earned or redeemed by a user.
 */
export const userPointsTransactions = mysqlTable("user_points_transactions", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),

    userId: char("user_id", { length: 36 })
        .references(() => users.id, { onDelete: "cascade" })
        .notNull(),

    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id, { onDelete: "cascade" })
        .notNull(),

    type: mysqlEnum("type", [
        "earn",          // كسب نقاط عند استلام الطلب
        "redeem",        // استبدال نقاط بوجبة
        "manual_adjust"  // تعديل يدوي من الإدارة
    ]).notNull(),

    points: int("points").notNull(),

    balanceBefore: int("balance_before").notNull(),

    balanceAfter: int("balance_after").notNull(),

    orderId: char("order_id", { length: 36 })
        .references(() => orders.id, { onDelete: "set null" }),

    note: varchar("note", { length: 255 }),

    createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
    userIdx: index  ("user_points_tx_user_idx").on(table.userId),
    restIdx: index("user_points_tx_rest_idx").on(table.restaurantId),
}));
