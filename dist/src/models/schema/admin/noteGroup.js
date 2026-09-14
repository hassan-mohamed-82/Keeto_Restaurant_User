"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.noteItemsRelations = exports.noteGroupsRelations = exports.noteItem = exports.noteItems = exports.noteGroup = exports.noteGroups = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const food_1 = require("./food");
exports.noteGroups = (0, mysql_core_1.mysqlTable)("note_groups", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    nameAr: (0, mysql_core_1.varchar)("name_ar", { length: 255 }),
    nameFr: (0, mysql_core_1.varchar)("name_fr", { length: 255 }),
    status: (0, mysql_core_1.mysqlEnum)("status", ["active", "inactive"]).default("active"),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
exports.noteGroup = exports.noteGroups;
exports.noteItems = (0, mysql_core_1.mysqlTable)("note_items", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    group_note_id: (0, mysql_core_1.char)("group_note_id", { length: 36 })
        .references(() => exports.noteGroups.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, mysql_core_1.varchar)("name", { length: 255 }).notNull(),
    nameAr: (0, mysql_core_1.varchar)("name_ar", { length: 255 }),
    nameFr: (0, mysql_core_1.varchar)("name_fr", { length: 255 }),
    status: (0, mysql_core_1.mysqlEnum)("status", ["active", "inactive"]).default("active"),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
});
exports.noteItem = exports.noteItems;
exports.noteGroupsRelations = (0, drizzle_orm_1.relations)(exports.noteGroups, ({ many }) => ({
    items: many(exports.noteItems),
    foods: many(food_1.food),
}));
exports.noteItemsRelations = (0, drizzle_orm_1.relations)(exports.noteItems, ({ one }) => ({
    group: one(exports.noteGroups, {
        fields: [exports.noteItems.group_note_id],
        references: [exports.noteGroups.id],
    }),
}));
