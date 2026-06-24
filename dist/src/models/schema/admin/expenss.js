"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expenss = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const expensscategory_1 = require("./expensscategory");
const restrauntadmin_1 = require("../admin/restrauntadmin");
const schema_1 = require("../../schema");
const restaurants_1 = require("./restaurants");
exports.expenss = (0, mysql_core_1.mysqlTable)("expensses", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restrauntid: (0, mysql_core_1.char)("restrauntid", { length: 36 }).references(() => restaurants_1.restaurants.id).notNull(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    amount: (0, mysql_core_1.decimal)("amount", { precision: 10, scale: 2 }).notNull(),
    categoryId: (0, mysql_core_1.char)("category_id", { length: 36 })
        .references(() => expensscategory_1.expensscategory.id)
        .notNull(),
    shiftId: (0, mysql_core_1.char)("shift_id", { length: 36 }),
    cashierId: (0, mysql_core_1.char)("cashier_id", { length: 36 }),
    cashiermanId: (0, mysql_core_1.char)("cashierman_id", { length: 36 })
        .references(() => restrauntadmin_1.restrauntadmin.id)
        .notNull(),
    note: (0, mysql_core_1.text)("note"),
    financialAccountId: (0, mysql_core_1.char)("financial_account_id", { length: 36 })
        .references(() => schema_1.FinancialAccounts.id),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
