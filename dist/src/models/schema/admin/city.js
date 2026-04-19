"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cities = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const country_1 = require("./country");
exports.cities = (0, mysql_core_1.mysqlTable)("cities", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    nameAr: (0, mysql_core_1.varchar)("name_ar", { length: 255 }),
    nameFr: (0, mysql_core_1.varchar)("name_fr", { length: 255 }),
    status: (0, mysql_core_1.mysqlEnum)("status", ["active", "inactive"]).default("active"),
    countryId: (0, mysql_core_1.char)("countryId", { length: 36 }).references(() => country_1.countries.id),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
