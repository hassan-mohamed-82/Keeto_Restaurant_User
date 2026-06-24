"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expensscategory = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
exports.expensscategory = (0, mysql_core_1.mysqlTable)("expensscategories", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantid: (0, mysql_core_1.char)("restaurantid", { length: 36 }).references(() => restaurants_1.restaurants.id).notNull(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    arName: (0, mysql_core_1.varchar)("ar_name", { length: 255 }).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
