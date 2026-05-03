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
    nameAr: varchar("name_ar", { length: 255 }),
    nameFr: varchar("name_fr", { length: 255 }),
    Image: varchar("image", { length:  500}).notNull(),
    meta_image: varchar("meta_image", { length: 500 }),
    title: text("title"),
    titleAr: text("title_ar"),
    titleFr: text("title_fr"),
    meta_title: text("meta_title"),
    meta_titleAr: text("meta_title_ar"),
    meta_titleFr: text("meta_title_fr"),
    priority: mysqlEnum("priority", ["low", "medium", "high"]).default("low"),
    status: mysqlEnum("status", ["active", "inactive"]).default("active"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});