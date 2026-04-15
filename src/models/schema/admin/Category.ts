import {
    mysqlTable,
    varchar,
    timestamp,
    mysqlEnum,
    json,
    char,
    text
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const categories = mysqlTable("categories", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    name: varchar("name", { length: 255 }).notNull(),
    Image: varchar("image", { length: 255 }).notNull(),
    meta_image: varchar("meta_image", { length: 255 }),
    title: text("title"),
    meta_title: text("meta_title"),
    priority: mysqlEnum("priority", ["low", "medium", "high"]).default("low"),
    status: mysqlEnum("status", ["active", "inactive"]).default("active"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});