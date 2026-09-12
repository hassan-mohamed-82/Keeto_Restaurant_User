// Replaces THREE old tables:
//   - productChannelPricing   (food price per branch/module)
//   - branchVariantPricing    (variant price per branch)
//   - variantChannelPricing   (variant price per branch/module)
//
// With TWO tables, using nullable branchId/serviceModule as "wildcards":
//   - branchId = NULL        → applies to ALL branches
//   - serviceModule = NULL   → applies to ALL service modules (takeaway/dine_in/delivery)
//
// Resolution priority (most → least specific), enforced in application code
// via ORDER BY (branch_id IS NOT NULL) DESC, (service_module IS NOT NULL) DESC:
//   1. branch + module match   (most specific)
//   2. branch match, module = NULL
//   3. module match, branch = NULL
//   4. base price (food.price / variationOptions.additionalPrice)
//
// ⚠️ MySQL CAVEAT: composite UNIQUE indexes treat each NULL as distinct, so
// MySQL will NOT stop you inserting two rows with the same (foodId, NULL,
// 'delivery') — the unique index only blocks true duplicates where every
// column has a concrete value. This is why every write goes through the
// select-then-insert/update upsert helpers in pricing.controller.ts instead
// of relying on the DB to reject duplicates. Do not bypass those helpers.

import {
    mysqlTable,
    char,
    decimal,
    mysqlEnum,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { food } from "./food";
import { branches } from "./branches";
import { variationOptions } from "./variation";

// ============================================================================
// 1. Food Pricing Overrides
// ============================================================================
export const foodPricingOverrides = mysqlTable(
    "food_pricing_overrides",
    {
        id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),

        foodId: char("food_id", { length: 36 })
            .references(() => food.id)
            .notNull(),

        // NULL = applies to every branch
        branchId: char("branch_id", { length: 36 }).references(() => branches.id),

        // NULL = applies to every service module (takeaway/dine_in/delivery)
        serviceModule: mysqlEnum("service_module", ["takeaway", "dine_in", "delivery"]),

        price: decimal("price", { precision: 10, scale: 2 }).notNull(),

        // active = this override is in effect, inactive = ignored (falls through
        // to the next-most-specific override / base price)
        status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),

        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    },
    (table) => ({
        uniqueOverride: uniqueIndex("unique_food_branch_module").on(
            table.foodId,
            table.branchId,
            table.serviceModule
        ),
    })
);

// ============================================================================
// 2. Variant (variation option) Pricing Overrides
// ============================================================================
export const variantPricingOverrides = mysqlTable(
    "variant_pricing_overrides",
    {
        id: char("id", { length: 36 }).primaryKey().default(sql`(UUID())`),

        variantId: char("variant_id", { length: 36 })
            .references(() => variationOptions.id)
            .notNull(),

        branchId: char("branch_id", { length: 36 }).references(() => branches.id),
        serviceModule: mysqlEnum("service_module", ["takeaway", "dine_in", "delivery"]),

        price: decimal("price", { precision: 10, scale: 2 }).notNull(),
        status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),

        createdAt: timestamp("created_at").defaultNow(),
        updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
    },
    (table) => ({
        uniqueOverride: uniqueIndex("unique_variant_branch_module").on(
            table.variantId,
            table.branchId,
            table.serviceModule
        ),
    })
);