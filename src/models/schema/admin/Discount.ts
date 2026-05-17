import {
    mysqlTable,
    varchar,
    char,
    timestamp,
    decimal,
    mysqlEnum,
    int,
    boolean,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { restaurants } from "./restaurants";

export const discounts = mysqlTable("discounts", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),

    restaurantId: char("restaurant_id", { length: 36 })
        .references(() => restaurants.id)
        .notNull(),

    name: varchar("name", { length: 255 }).notNull(),
    nameAr: varchar("name_ar", { length: 255 }),
    nameFr: varchar("name_fr", { length: 255 }),

    // percentage | fixed_amount
    discountType: mysqlEnum("discount_type", ["percentage", "fixed_amount"])
        .notNull()
        .default("percentage"),

    // The value: e.g. 20 means 20% OR 20 currency units
    discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),

    // Optional cap: e.g. max discount of 50 EGP when type is percentage
    maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }),

    // Minimum order subtotal to be eligible
    minOrderAmount: decimal("min_order_amount", { precision: 10, scale: 2 }).default("0.00"),

    // How many times can this discount be used in total (null = unlimited)
    usageLimit: int("usage_limit"),

    // How many times it has been used so far
    usedCount: int("used_count").default(0),

    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),

    isActive: boolean("is_active").default(true),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
