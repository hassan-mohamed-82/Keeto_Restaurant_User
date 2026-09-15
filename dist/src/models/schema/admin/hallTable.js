"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hallTablesRelations = exports.hallTables = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
const hall_1 = require("./hall");
exports.hallTables = (0, mysql_core_1.mysqlTable)("hall_tables", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id, { onDelete: "cascade" })
        .notNull(),
    hallId: (0, mysql_core_1.char)("hall_id", { length: 36 })
        .references(() => hall_1.halls.id, { onDelete: "cascade" })
        .notNull(),
    tblNumber: (0, mysql_core_1.varchar)("tbl_number", { length: 50 }).notNull(),
    capacity: (0, mysql_core_1.int)("capacity").default(1).notNull(),
    qr: (0, mysql_core_1.varchar)("qr", { length: 500 }).notNull(),
    occupied: (0, mysql_core_1.boolean)("occupied").default(false).notNull(),
    status: (0, mysql_core_1.boolean)("status").default(true).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
exports.hallTablesRelations = (0, drizzle_orm_1.relations)(exports.hallTables, ({ one }) => ({
    restaurant: one(restaurants_1.restaurants, {
        fields: [exports.hallTables.restaurantId],
        references: [restaurants_1.restaurants.id],
    }),
    hall: one(hall_1.halls, {
        fields: [exports.hallTables.hallId],
        references: [hall_1.halls.id],
    }),
}));
