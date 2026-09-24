"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printersRelations = exports.printers = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
const branches_1 = require("./branches");
exports.printers = (0, mysql_core_1.mysqlTable)("printers", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id, { onDelete: "cascade" })
        .notNull(),
    branchId: (0, mysql_core_1.char)("branch_id", { length: 36 })
        .references(() => branches_1.branches.id, { onDelete: "cascade" }),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    ip: (0, mysql_core_1.varchar)("ip", { length: 100 }),
    port: (0, mysql_core_1.int)("port"),
    type: (0, mysql_core_1.mysqlEnum)("type", ["usb", "network"]).notNull().default("network"),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
exports.printersRelations = (0, drizzle_orm_1.relations)(exports.printers, ({ one }) => ({
    restaurant: one(restaurants_1.restaurants, {
        fields: [exports.printers.restaurantId],
        references: [restaurants_1.restaurants.id],
    }),
    branch: one(branches_1.branches, {
        fields: [exports.printers.branchId],
        references: [branches_1.branches.id],
    }),
}));
