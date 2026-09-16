import {
    mysqlTable,
    varchar,
    char,
    timestamp,
    boolean,
    json,
    uniqueIndex,
    type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { sql, relations } from "drizzle-orm";
import { restaurants } from "./restaurants";
import { branches } from "./branches";
import { cashiers } from "./cashier";

export const cashierMen = mysqlTable(
    "cashier_men",
    {
        id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
        restaurantId: char("restaurant_id", { length: 36 })
            .references(() => restaurants.id, { onDelete: "cascade" })
            .notNull(),
        branchId: char("branch_id", { length: 36 })
            .references(() => branches.id, { onDelete: "cascade" })
            .notNull(),
        cashierId: char("cashier_id", { length: 36 })
            .references((): AnyMySqlColumn => cashiers.id, { onDelete: "set null" }),
        myId: varchar("my_id", { length: 255 }),
        name: varchar("name", { length: 255 }),
        userName: varchar("user_name", { length: 255 }).notNull(),
        phone: varchar("phone", { length: 50 }).notNull(),
        password: varchar("password", { length: 255 }).notNull(),
        image: varchar("image", { length: 500 }),
        roles: json("roles").$type<string[]>().default([]).notNull(),
        report_perimission: json("report_perimission").$type<string[]>().default([]).notNull(),
        status: boolean("status").default(true).notNull(),
        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    },
    (table) => ({
        restaurantUserNameIdx: uniqueIndex("uk_cashier_men_restaurant_user_name").on(
            table.restaurantId,
            table.userName
        ),
        restaurantPhoneIdx: uniqueIndex("uk_cashier_men_restaurant_phone").on(
            table.restaurantId,
            table.phone
        ),
    })
);

export const cashierMenRelations = relations(cashierMen, ({ one }) => ({
    restaurant: one(restaurants, {
        fields: [cashierMen.restaurantId],
        references: [restaurants.id],
    }),
    branch: one(branches, {
        fields: [cashierMen.branchId],
        references: [branches.id],
    }),
    cashier: one(cashiers, {
        fields: [cashierMen.cashierId],
        references: [cashiers.id],
    }),
}));

export type CashierMan = typeof cashierMen.$inferSelect;
export type NewCashierMan = typeof cashierMen.$inferInsert;
