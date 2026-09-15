"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storesRelations = exports.stores = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
exports.stores = (0, mysql_core_1.mysqlTable)("stores", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    nameAr: (0, mysql_core_1.varchar)("name_ar", { length: 255 }),
    nameFr: (0, mysql_core_1.varchar)("name_fr", { length: 255 }),
    lat: (0, mysql_core_1.decimal)("lat", { precision: 10, scale: 8 }),
    lng: (0, mysql_core_1.decimal)("lng", { precision: 11, scale: 8 }),
    brancheIds: (0, mysql_core_1.json)("branche_ids").$type().default([]).notNull(),
    status: (0, mysql_core_1.boolean)("status").default(true).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
exports.storesRelations = (0, drizzle_orm_1.relations)(exports.stores, ({ one }) => ({
    restaurant: one(restaurants_1.restaurants, {
        fields: [exports.stores.restaurantId],
        references: [restaurants_1.restaurants.id],
    }),
}));
