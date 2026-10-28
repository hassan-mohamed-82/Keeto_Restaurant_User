import { mysqlTable, char, varchar, text, timestamp, mysqlEnum, boolean, int } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { restaurants } from "./restaurants";

/**
 * Admin-initiated push notifications to all restaurant users.
 * Supports immediate dispatch ("pushed_now") or scheduled dispatch
 * with optional start/end date-times.
 */
export const pushedNotifications = mysqlTable("pushed_notifications", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),

    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id, { onDelete: "cascade" })
        .notNull(),

    /** The notification title shown to users */
    title: varchar("title", { length: 255 }).notNull(),

    /** The notification body text */
    body: text("body").notNull(),

    /**
     * Dispatch mode:
     *  - "pushed_now" : send immediately (default)
     *  - "scheduled"  : send between scheduledAt and scheduledEndAt
     */
    mode: mysqlEnum("mode", ["pushed_now", "scheduled"]).notNull().default("pushed_now"),

    /** When to start sending (used when mode = "scheduled") */
    scheduledAt: timestamp("scheduled_at"),

    /** When to stop sending (optional upper bound for scheduled mode) */
    scheduledEndAt: timestamp("scheduled_end_at"),

    /** Whether this notification has been dispatched via FCM */
    isSent: boolean("is_sent").default(false),

    /** Timestamp when FCM dispatch actually occurred */
    sentAt: timestamp("sent_at"),

    /** How many FCM tokens were targeted */
    recipientCount: int("recipient_count").default(0),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
