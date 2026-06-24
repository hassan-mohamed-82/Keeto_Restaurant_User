import { mysqlTable, varchar, char, decimal, timestamp, text } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { expensscategory } from "./expensscategory";
import { restrauntadmin } from "../admin/restrauntadmin";
import { paymentMethods } from "../admin/payment_methodes";
import { restaurants } from "./restaurants";

export const expenss = mysqlTable("expensses", {
    id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
    restrauntid: char("restrauntid", { length: 36 }).references(() => restaurants.id).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    
    categoryId: char("category_id", { length: 36 })
        .references(() => expensscategory.id)
        .notNull(),
        
    shiftId: char("shift_id", { length: 36 }), 
    
    cashierId: char("cashier_id", { length: 36 }), 
    
    cashiermanId: char("cashierman_id", { length: 36 })
        .references(() => restrauntadmin.id)
        .notNull(),
        
    note: text("note"),
    
    paymentmethodId: char("paymentmethod_id", { length: 36 })
        .references(() => paymentMethods.id),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});
