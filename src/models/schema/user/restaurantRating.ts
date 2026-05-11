import { mysqlTable, char, timestamp, int, text } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { users } from "./Users";
import { restaurants } from "../admin/restaurants";

export const restaurantRatings = mysqlTable("restaurant_ratings", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),

    userId: char("user_id", { length: 36 })
        .references(() => users.id)
        .notNull(),

    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id)
        .notNull(),

    // التقييم من 1 لـ 5
    rating: int("rating").notNull(),

    // تعليق اختياري
    comment: text("comment"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
