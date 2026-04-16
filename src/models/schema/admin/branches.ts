
import {
    mysqlTable,
    varchar,
    timestamp,
    mysqlEnum,
    json,
    char,
    text,
    time
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { restaurants, zones } from "../../schema";
export const branches = mysqlTable("branches", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    
    // مربوط بالمطعم الأساسي اللي إنت (كسوبر أدمن) لسه مكريته
    restaurantId: char("restaurant_id", { length: 36 }).references(() => restaurants.id).notNull(),
    
    name: varchar("name", { length: 255 }).notNull(), // فرع مدينة نصر مثلاً
    address: text("address").notNull(),
    phoneNumber: varchar("phone_number", { length: 50 }),
    zoneId: char("zone_id", { length: 36 }).references(() => zones.id).notNull(), // عشان منطقة توصيل الفرع ده
    
    status: mysqlEnum("status", ["active", "inactive"]).default("active"),
    createdAt: timestamp("created_at").defaultNow(),
});