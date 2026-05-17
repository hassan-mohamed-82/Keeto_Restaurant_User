"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.policy = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
exports.policy = (0, mysql_core_1.mysqlTable)("policy", {
    id: (0, mysql_core_1.char)("id", { length: 36 })
        .primaryKey()
        .default((0, drizzle_orm_1.sql) `(UUID())`),
    title: (0, mysql_core_1.varchar)("title", { length: 255 })
        .notNull(),
    description: (0, mysql_core_1.text)("description")
        .notNull(),
    type: (0, mysql_core_1.mysqlEnum)("type", [
        "keto",
        "restaurant",
    ]).notNull(),
    // خاص بالمطاعم فقط
    restaurantId: (0, mysql_core_1.char)("restaurant_id", {
        length: 36,
    }).references(() => restaurants_1.restaurants.id),
    createdAt: (0, mysql_core_1.timestamp)("created_at")
        .defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at")
        .defaultNow()
        .onUpdateNow(),
});
