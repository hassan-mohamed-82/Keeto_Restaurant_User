"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suppliersRelations = exports.suppliers = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
exports.suppliers = (0, mysql_core_1.mysqlTable)("suppliers", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    email: (0, mysql_core_1.varchar)("email", { length: 255 }),
    phone: (0, mysql_core_1.varchar)("phone", { length: 50 }).notNull(),
    balance: (0, mysql_core_1.decimal)("balance", { precision: 10, scale: 2 }).default("0.00").notNull(),
    status: (0, mysql_core_1.boolean)("status").default(true).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
exports.suppliersRelations = (0, drizzle_orm_1.relations)(exports.suppliers, ({ one }) => ({
    restaurant: one(restaurants_1.restaurants, {
        fields: [exports.suppliers.restaurantId],
        references: [restaurants_1.restaurants.id],
    }),
}));
