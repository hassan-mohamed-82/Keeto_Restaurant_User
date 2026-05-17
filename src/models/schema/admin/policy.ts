import {
    mysqlTable,
    varchar,
    timestamp,
    mysqlEnum,
    char,
    text,
} from "drizzle-orm/mysql-core";

import { sql } from "drizzle-orm";

import { restaurants } from "./restaurants";

export const policy = mysqlTable("policy", {

    id: char("id", { length: 36 })
        .primaryKey()
        .default(sql`(UUID())`),

    title: varchar("title", { length: 255 })
        .notNull(),

    description: text("description")
        .notNull(),

    type: mysqlEnum("type", [
        "keto",
        "restaurant",
    ]).notNull(),

    // خاص بالمطاعم فقط
    restaurantId: char("restaurant_id", {
        length: 36,
    }).references(() => restaurants.id),

    createdAt: timestamp("created_at")
        .defaultNow(),

    updatedAt: timestamp("updated_at")
        .defaultNow()
        .onUpdateNow(),
});