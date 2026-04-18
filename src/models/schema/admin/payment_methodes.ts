// models/paymentMethods.ts
import {
  mysqlTable,
  varchar,
  char,
  boolean,
  timestamp,
  mysqlEnum
} from "drizzle-orm/mysql-core";

import { sql } from "drizzle-orm";

export const paymentMethods = mysqlTable("payment_methods", {
  id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),
  name: varchar("name", { length: 100 }).notNull(),
  nameAr: varchar("name_ar", { length: 100 }),
  nameFr: varchar("name_fr", { length: 100 }),
  image: varchar("image", { length: 255 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  descriptionAr: varchar("description_ar", { length: 255 }),
  descriptionFr: varchar("description_fr", { length: 255 }),
  type: mysqlEnum("type", ["wallet", "cash", "visa"]).notNull(),
  isActive: boolean("is_active").default(true),

  createdAt: timestamp("created_at").defaultNow(),
});