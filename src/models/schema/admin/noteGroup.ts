import {
    mysqlTable,
    varchar,
    timestamp,
    mysqlEnum,
    char
} from "drizzle-orm/mysql-core";
import { sql, relations } from "drizzle-orm";
import { food } from "./food";

export const noteGroups = mysqlTable("note_groups", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    name: varchar("name", { length: 255 }).notNull(),
    nameAr: varchar("name_ar", { length: 255 }),
    nameFr: varchar("name_fr", { length: 255 }),
    status: mysqlEnum("status", ["active", "inactive"]).default("active"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const noteGroup = noteGroups;

export const noteItems = mysqlTable("note_items", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    group_note_id: char("group_note_id", { length: 36 })
        .references(() => noteGroups.id, { onDelete: "cascade" })
        .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    nameAr: varchar("name_ar", { length: 255 }),
    nameFr: varchar("name_fr", { length: 255 }),
    status: mysqlEnum("status", ["active", "inactive"]).default("active"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const noteItem = noteItems;

export const noteGroupsRelations = relations(noteGroups, ({ many }) => ({
    items: many(noteItems),
    foods: many(food),
}));

export const noteItemsRelations = relations(noteItems, ({ one }) => ({
    group: one(noteGroups, {
        fields: [noteItems.group_note_id],
        references: [noteGroups.id],
    }),
}));

export type NoteGroup = typeof noteGroups.$inferSelect;
export type NewNoteGroup = typeof noteGroups.$inferInsert;
export type NoteItem = typeof noteItems.$inferSelect;
export type NewNoteItem = typeof noteItems.$inferInsert;
