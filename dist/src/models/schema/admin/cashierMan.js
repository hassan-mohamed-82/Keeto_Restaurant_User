"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cashierMenRelations = exports.cashierMen = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
const branches_1 = require("./branches");
exports.cashierMen = (0, mysql_core_1.mysqlTable)("cashier_men", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id, { onDelete: "cascade" })
        .notNull(),
    branchId: (0, mysql_core_1.char)("branch_id", { length: 36 })
        .references(() => branches_1.branches.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }),
    userName: (0, mysql_core_1.varchar)("user_name", { length: 255 }).unique().notNull(),
    phone: (0, mysql_core_1.varchar)("phone", { length: 50 }).unique().notNull(),
    password: (0, mysql_core_1.varchar)("password", { length: 255 }).notNull(),
    image: (0, mysql_core_1.varchar)("image", { length: 500 }),
    roles: (0, mysql_core_1.json)("roles").$type().default([]).notNull(),
    report_perimission: (0, mysql_core_1.json)("report_perimission").$type().default([]).notNull(),
    status: (0, mysql_core_1.boolean)("status").default(true).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
exports.cashierMenRelations = (0, drizzle_orm_1.relations)(exports.cashierMen, ({ one }) => ({
    restaurant: one(restaurants_1.restaurants, {
        fields: [exports.cashierMen.restaurantId],
        references: [restaurants_1.restaurants.id],
    }),
    branch: one(branches_1.branches, {
        fields: [exports.cashierMen.branchId],
        references: [branches_1.branches.id],
    }),
}));
