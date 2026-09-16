"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captainOrdersRelations = exports.captainOrders = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
const branches_1 = require("./branches");
exports.captainOrders = (0, mysql_core_1.mysqlTable)("captain_orders", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id, { onDelete: "cascade" })
        .notNull(),
    branchId: (0, mysql_core_1.char)("branch_id", { length: 36 })
        .references(() => branches_1.branches.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    userName: (0, mysql_core_1.varchar)("user_name", { length: 255 }).notNull(),
    phone: (0, mysql_core_1.varchar)("phone", { length: 50 }).notNull(),
    password: (0, mysql_core_1.varchar)("password", { length: 255 }).notNull(),
    image: (0, mysql_core_1.varchar)("image", { length: 500 }),
    hallIds: (0, mysql_core_1.json)("hall_ids").$type().default([]).notNull(),
    status: (0, mysql_core_1.boolean)("status").default(true).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
    restaurantUserNameIdx: (0, mysql_core_1.uniqueIndex)("uk_captain_orders_restaurant_user_name").on(table.restaurantId, table.userName),
    restaurantPhoneIdx: (0, mysql_core_1.uniqueIndex)("uk_captain_orders_restaurant_phone").on(table.restaurantId, table.phone),
}));
exports.captainOrdersRelations = (0, drizzle_orm_1.relations)(exports.captainOrders, ({ one }) => ({
    restaurant: one(restaurants_1.restaurants, {
        fields: [exports.captainOrders.restaurantId],
        references: [restaurants_1.restaurants.id],
    }),
    branch: one(branches_1.branches, {
        fields: [exports.captainOrders.branchId],
        references: [branches_1.branches.id],
    }),
}));
