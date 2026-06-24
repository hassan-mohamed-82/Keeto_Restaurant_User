import {
    mysqlTable,
    varchar,
    char,
    timestamp,
    decimal,
    mysqlEnum,
    int,
    boolean,
    uniqueIndex
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { restaurants } from "./restaurants";
import { food } from "./food";
import { branches } from "../../schema";

// ==========================================
// 1. Discounts Table
// ==========================================
export const FinancialAccounts = mysqlTable("FinancialAccounts", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
        
    name: varchar("name", { length: 255 }).notNull(),
    restaurantId: char("restaurant_id", { length: 36 }).references(() => restaurants.id).notNull(),
    branchId: char("branch_id", { length: 36 }).references(() => branches.id).notNull(),
    isActive: boolean("is_active").default(true),
    imageUrl: varchar("image_url", { length: 255 }),
    balance: decimal("balance", { precision: 10, scale: 2 }).default("0.00"),
    in_POS: boolean("in_pos").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
