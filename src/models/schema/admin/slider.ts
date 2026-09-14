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
import { restaurants } from "./restaurants";
import { subcategories } from "./subcategory";
import { food } from "./food";
import { discounts } from "./Discount";
import { sql } from "drizzle-orm";

export const sliders = mysqlTable("sliders", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restaurantid: char("restaurantid", { length: 36 })
        .references(() => restaurants.id)
        .notNull(),
    img: varchar("img", { length: 500 }).notNull(),
    periorty: int("periorty").default(0),
    linkType: mysqlEnum("link_type", ["link", "subcategory", "product", "discount"]).default("link"),
    link: varchar("link", { length: 500 }),
    subcategoryId: char("subcategory_id", { length: 36 }).references(() => subcategories.id, { onDelete: "set null" }),
    foodId: char("food_id", { length: 36 }).references(() => food.id, { onDelete: "set null" }),
    discountId: char("discount_id", { length: 36 }).references(() => discounts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
