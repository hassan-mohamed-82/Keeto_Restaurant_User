import { mysqlTable, varchar, char, timestamp, mysqlEnum, json } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { rolesadmin } from "./roles";
import { Permission } from "../../../types/custom";

export const restrauntadmin = mysqlTable("admins", {
    id: char("id", { length: 255 }).primaryKey().notNull().default(sql`(uuid())`),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    type: mysqlEnum("type", ["restaurantadmin", "subadmin"]).notNull().default("subadmin"),
    phoneNumber: varchar("phone_number", { length: 255 }).notNull(),
    password: varchar("password", { length: 255 }).notNull(),
    roleId: char("role_id", { length: 36 }).references(() => rolesadmin.id),
    permissions: json("permissions").$type<Permission[]>().default([]),
    status: mysqlEnum("status", ["active", "inactive"]).notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});