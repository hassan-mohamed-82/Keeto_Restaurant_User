"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentMethods = void 0;
// models/paymentMethods.ts
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
exports.paymentMethods = (0, mysql_core_1.mysqlTable)("payment_methods", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    name: (0, mysql_core_1.varchar)("name", { length: 100 }).notNull(),
    nameAr: (0, mysql_core_1.varchar)("name_ar", { length: 100 }),
    nameFr: (0, mysql_core_1.varchar)("name_fr", { length: 100 }),
    image: (0, mysql_core_1.varchar)("image", { length: 255 }).notNull(),
    description: (0, mysql_core_1.varchar)("description", { length: 255 }).notNull(),
    descriptionAr: (0, mysql_core_1.varchar)("description_ar", { length: 255 }),
    descriptionFr: (0, mysql_core_1.varchar)("description_fr", { length: 255 }),
    type: (0, mysql_core_1.mysqlEnum)("type", ["wallet", "cash", "visa"]).notNull(),
    isActive: (0, mysql_core_1.boolean)("is_active").default(true),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
});
