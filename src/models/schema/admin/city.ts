import {
    mysqlTable,
    varchar,
    timestamp,
    mysqlEnum,
    json,
    char,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { countries } from "./country";
export const cities = mysqlTable("cities", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    name: varchar("name", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active"),
    countryId: char("countryId", { length: 36 }).references(() => countries.id),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    
});