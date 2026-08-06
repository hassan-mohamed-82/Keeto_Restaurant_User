import {
    mysqlTable,
    char,
    boolean,
    timestamp,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { restaurants } from "./restaurants";
import { food } from "./food";

/**
 * points_products
 * ---------------
 * Enrollment list: tracks which food items are part of the restaurant's
 * loyalty-points program. The points value itself lives on food.points —
 * no duplication here. Admin selects foods; each food's `points` field
 * already holds how many points it awards.
 */
export const pointsProducts = mysqlTable("points_products", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),

    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id)
        .notNull(),

    foodId: char("food_id", { length: 36 })
        .references(() => food.id)
        .notNull(),

    /** Toggle: temporarily disable a food from awarding points without removing it */
    isActive: boolean("is_active").default(true),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
