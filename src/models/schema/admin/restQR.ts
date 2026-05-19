import { mysqlTable, varchar, timestamp } from "drizzle-orm/mysql-core";
import { restaurants } from "./restaurants";
import { sql } from "drizzle-orm";

export const restaurantsUrl = mysqlTable("restaurantsUrl", {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantid: varchar("restaurantid", { length: 36 })
        .references(() => restaurants.id)
        .notNull(),
    qrCodeImg: varchar("qr_code_img", { length: 1024 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});