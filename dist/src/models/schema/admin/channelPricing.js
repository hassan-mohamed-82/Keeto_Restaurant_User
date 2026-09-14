"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.variantPricingOverrides = exports.foodPricingOverrides = void 0;
const mysql_core_1 = require("drizzle-orm/mysql-core");
const drizzle_orm_1 = require("drizzle-orm");
const food_1 = require("./food");
const branches_1 = require("./branches");
const variation_1 = require("./variation");
// ============================================================================
// 1. Food Pricing Overrides
// ============================================================================
exports.foodPricingOverrides = (0, mysql_core_1.mysqlTable)("food_pricing_overrides", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    foodId: (0, mysql_core_1.char)("food_id", { length: 36 })
        .references(() => food_1.food.id)
        .notNull(),
    // NULL = applies to every branch
    branchId: (0, mysql_core_1.char)("branch_id", { length: 36 }).references(() => branches_1.branches.id),
    // NULL = applies to every service module (takeaway/dine_in/delivery)
    serviceModule: (0, mysql_core_1.mysqlEnum)("service_module", ["takeaway", "dine_in", "delivery"]),
    price: (0, mysql_core_1.decimal)("price", { precision: 10, scale: 2 }).notNull(),
    // active = this override is in effect, inactive = ignored (falls through
    // to the next-most-specific override / base price)
    status: (0, mysql_core_1.mysqlEnum)("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
    uniqueOverride: (0, mysql_core_1.uniqueIndex)("unique_food_branch_module").on(table.foodId, table.branchId, table.serviceModule),
}));
// ============================================================================
// 2. Variant (variation option) Pricing Overrides
// ============================================================================
exports.variantPricingOverrides = (0, mysql_core_1.mysqlTable)("variant_pricing_overrides", {
    id: (0, mysql_core_1.char)("id", { length: 36 }).primaryKey().default((0, drizzle_orm_1.sql) `(UUID())`),
    variantId: (0, mysql_core_1.char)("variant_id", { length: 36 })
        .references(() => variation_1.variationOptions.id)
        .notNull(),
    branchId: (0, mysql_core_1.char)("branch_id", { length: 36 }).references(() => branches_1.branches.id),
    serviceModule: (0, mysql_core_1.mysqlEnum)("service_module", ["takeaway", "dine_in", "delivery"]),
    price: (0, mysql_core_1.decimal)("price", { precision: 10, scale: 2 }).notNull(),
    status: (0, mysql_core_1.mysqlEnum)("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at").defaultNow(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
    uniqueOverride: (0, mysql_core_1.uniqueIndex)("unique_variant_branch_module").on(table.variantId, table.branchId, table.serviceModule),
}));
