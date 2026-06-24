import {
    mysqlTable,
    varchar,
    char,
    boolean,
    timestamp,
    mysqlEnum
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { branches, paymentMethods, restaurants } from "../../schema";

export const cashiers = mysqlTable("cashiers", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantid: char("restaurant_id", { length: 36 }).references(() => restaurants.id).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    ar_name: varchar("ar_name", { length: 255 }),
    
    status: mysqlEnum("status", ["active", "inactive"]).default("active"),
    
    branchid: char("branch_id", { length: 36 }).references(() => branches.id).notNull(),
    
    cashier_active: boolean("cashier_active").default(true),
    
    paymentmethodid: char("payment_method_id", { length: 36 }).references(() => paymentMethods.id).notNull(),
    
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
