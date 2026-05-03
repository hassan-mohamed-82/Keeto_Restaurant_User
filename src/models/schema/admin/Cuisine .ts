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
export const cuisines = mysqlTable("cuisines", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    name: varchar("name", { length: 255 }).notNull(),
    nameAr: varchar("name_ar", { length: 255 }),
    nameFr: varchar("name_fr", { length: 255 }),
    Image: varchar("image", { length: 500 }).notNull(),
    meta_image: varchar("meta_image", { length: 500 }),
    description: text("description"),
    descriptionAr: text("description_ar"),
    descriptionFr: text("description_fr"),
    meta_description: text("meta_description"),
    meta_descriptionAr: text("meta_description_ar").notNull(),
    meta_descriptionFr: text("meta_description_fr").notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active"),
    total_restaurants: varchar("total_restaurants", { length: 255 }).default("0"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});