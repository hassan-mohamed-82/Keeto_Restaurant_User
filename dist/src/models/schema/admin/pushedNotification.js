"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushedNotifications = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
/**
 * Admin-initiated push notifications to all restaurant users.
 * Supports immediate dispatch ("pushed_now") or scheduled dispatch
 * with optional start/end date-times.
 */
exports.pushedNotifications = (0, mysql_core_1.mysqlTable)("pushed_notifications", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id, { onDelete: "cascade" })
        .notNull(),
    /** The notification title shown to users */
    title: (0, mysql_core_1.varchar)("title", { length: 255 }).notNull(),
    /** The notification body text */
    body: (0, mysql_core_1.text)("body").notNull(),
    /**
     * Dispatch mode:
     *  - "pushed_now" : send immediately (default)
     *  - "scheduled"  : send between scheduledAt and scheduledEndAt
     */
    mode: (0, mysql_core_1.mysqlEnum)("mode", ["pushed_now", "scheduled"]).notNull().default("pushed_now"),
    /** When to start sending (used when mode = "scheduled") */
    scheduledAt: (0, mysql_core_1.timestamp)("scheduled_at"),
    /** When to stop sending (optional upper bound for scheduled mode) */
    scheduledEndAt: (0, mysql_core_1.timestamp)("scheduled_end_at"),
    /** Whether this notification has been dispatched via FCM */
    isSent: (0, mysql_core_1.boolean)("is_sent").default(false),
    /** Timestamp when FCM dispatch actually occurred */
    sentAt: (0, mysql_core_1.timestamp)("sent_at"),
    /** How many FCM tokens were targeted */
    recipientCount: (0, mysql_core_1.int)("recipient_count").default(0),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
