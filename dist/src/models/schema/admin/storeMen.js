"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeMenRelations = exports.storeMen = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
const stores_1 = require("./stores");
exports.storeMen = (0, mysql_core_1.mysqlTable)("store_men", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id, { onDelete: "cascade" })
        .notNull(),
    storeId: (0, mysql_core_1.char)("store_id", { length: 36 })
        .references(() => stores_1.stores.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    phone: (0, mysql_core_1.varchar)("phone", { length: 50 }).notNull(),
    password: (0, mysql_core_1.varchar)("password", { length: 255 }).notNull(),
    image: (0, mysql_core_1.varchar)("image", { length: 500 }),
    status: (0, mysql_core_1.boolean)("status").default(true).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
exports.storeMenRelations = (0, drizzle_orm_1.relations)(exports.storeMen, ({ one }) => ({
    restaurant: one(restaurants_1.restaurants, {
        fields: [exports.storeMen.restaurantId],
        references: [restaurants_1.restaurants.id],
    }),
    store: one(stores_1.stores, {
        fields: [exports.storeMen.storeId],
        references: [stores_1.stores.id],
    }),
}));
