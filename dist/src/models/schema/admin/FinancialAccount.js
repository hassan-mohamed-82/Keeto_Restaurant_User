"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialAccounts = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
const schema_1 = require("../../schema");
// ==========================================
// 1. Discounts Table
// ==========================================
exports.FinancialAccounts = (0, mysql_core_1.mysqlTable)("FinancialAccounts", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 }).references(() => restaurants_1.restaurants.id).notNull(),
    branchId: (0, mysql_core_1.char)("branch_id", { length: 36 }).references(() => schema_1.branches.id).notNull(),
    isActive: (0, mysql_core_1.boolean)("is_active").default(true),
    imageUrl: (0, mysql_core_1.varchar)("image_url", { length: 255 }),
    balance: (0, mysql_core_1.decimal)("balance", { precision: 10, scale: 2 }).default("0.00"),
    in_POS: (0, mysql_core_1.boolean)("in_pos").default(false),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
