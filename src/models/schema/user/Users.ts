import { mysqlTable, varchar, text, timestamp, char, boolean } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const users = mysqlTable("users", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    name: varchar("name", { length: 255 }).notNull(),
    photo: varchar("photo", { length: 255 }),
    email: varchar("email", { length: 255 }).notNull().unique(),
    phone: varchar("phone", { length: 20 }),
    fcmToken: text("fcm_token"),
    password: varchar("password", { length: 255 }),
    googleId: varchar("google_id", { length: 255 }),
    facebookId: varchar("facebook_id", { length: 255 }), // ➕ ضفنا ده عشان فيسبوك
    isVerified: boolean("is_verified").default(false),
    createdAt: timestamp("created_at").defaultNow(),
});