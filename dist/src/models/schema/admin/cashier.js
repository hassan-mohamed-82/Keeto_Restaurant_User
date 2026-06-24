"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cashiers = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../../schema");
const schema_2 = require("../../schema");
exports.cashiers = (0, mysql_core_1.mysqlTable)("cashiers", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantid: (0, mysql_core_1.char)("restaurant_id", { length: 36 }).references(() => schema_1.restaurants.id).notNull(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    ar_name: (0, mysql_core_1.varchar)("ar_name", { length: 255 }),
    status: (0, mysql_core_1.mysqlEnum)("status", ["active", "inactive"]).default("active"),
    branchid: (0, mysql_core_1.char)("branch_id", { length: 36 }).references(() => schema_1.branches.id).notNull(),
    cashier_active: (0, mysql_core_1.boolean)("cashier_active").default(true),
    financialAccountId: (0, mysql_core_1.char)("financial_account_id", { length: 36 }).references(() => schema_2.FinancialAccounts.id).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
