"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hallsRelations = exports.halls = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const restaurants_1 = require("./restaurants");
const branches_1 = require("./branches");
const hallTable_1 = require("./hallTable");
exports.halls = (0, mysql_core_1.mysqlTable)("halls", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    restaurantId: (0, mysql_core_1.char)("restaurant_id", { length: 36 })
        .references(() => restaurants_1.restaurants.id, { onDelete: "cascade" })
        .notNull(),
    branchId: (0, mysql_core_1.char)("branch_id", { length: 36 })
        .references(() => branches_1.branches.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    nameAr: (0, mysql_core_1.varchar)("name_ar", { length: 255 }),
    nameFr: (0, mysql_core_1.varchar)("name_fr", { length: 255 }),
    lat: (0, mysql_core_1.varchar)("lat", { length: 255 }),
    lng: (0, mysql_core_1.varchar)("lng", { length: 255 }),
    status: (0, mysql_core_1.boolean)("status").default(true).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
exports.hallsRelations = (0, drizzle_orm_1.relations)(exports.halls, ({ one, many }) => ({
    restaurant: one(restaurants_1.restaurants, {
        fields: [exports.halls.restaurantId],
        references: [restaurants_1.restaurants.id],
    }),
    branch: one(branches_1.branches, {
        fields: [exports.halls.branchId],
        references: [branches_1.branches.id],
    }),
    tables: many(hallTable_1.hallTables),
}));
