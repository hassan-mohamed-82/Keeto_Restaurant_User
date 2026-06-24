import { mysqlTable, varchar, char, timestamp } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { restaurants } from "./restaurants";

export const expensscategory = mysqlTable("expensscategories", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantid: char("restaurantid", { length: 36 }).references(() => restaurants.id).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    arName: varchar("ar_name", { length: 255 }).notNull(),
    
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
