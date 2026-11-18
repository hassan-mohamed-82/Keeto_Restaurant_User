"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.planImport = planImport;
exports.executeImportPlan = executeImportPlan;
// =============================================================================
// Orchestrates the import: parse → load lookups once → validate → insert.
// Inserts go through the same helpers as createSubcategory / createFood, in a
// single transaction (any failure rolls everything back).
// =============================================================================
const connection_1 = require("../../models/connection");
const menu_insert_1 = require("../../helpers/menu.insert");
const parser_1 = require("./parser");
const resolver_1 = require("./resolver");
const validator_1 = require("./validator");
/** Parses and validates an uploaded workbook. Never writes to the database. */
async function planImport(file, restaurantId) {
    const parsed = await (0, parser_1.parseWorkbook)(file);
    if (parsed.fatalErrors.length > 0) {
        return { subcategories: [], foods: [], skipped: [], errors: parsed.fatalErrors, counts: { ...validator_1.EMPTY_COUNTS } };
    }
    const lookups = await (0, resolver_1.loadImportLookups)(restaurantId);
    return (0, validator_1.validateImport)(parsed, lookups);
}
function subcategoryIdFor(link, created) {
    if (!link)
        return null;
    if (link.kind === "existing")
        return link.id;
    const id = created.get(link.key);
    if (!id)
        throw new Error(`Bulk import: subcategory "${link.key}" was not created before its foods`);
    return id;
}
/**
 * Inserts a validated plan in ONE transaction: subcategories first, then each
 * food with its variations and options.
 */
async function executeImportPlan(restaurantId, plan) {
    if (plan.errors.length > 0) {
        throw new Error("Bulk import: refusing to insert a plan that has validation errors");
    }
    return connection_1.db.transaction(async (tx) => {
        // "categoryId|normalized subcategory name" → new subcategory id
        const createdSubcategories = new Map();
        for (const item of plan.subcategories) {
            const id = await (0, menu_insert_1.insertSubcategory)(tx, restaurantId, item.data);
            createdSubcategories.set(item.key, id);
        }
        for (const item of plan.foods) {
            await (0, menu_insert_1.insertFood)(tx, restaurantId, {
                ...item.data,
                subcategoryid: subcategoryIdFor(item.subcategory, createdSubcategories),
            });
        }
        return {
            subcategoriesCreated: plan.subcategories.length,
            foodsCreated: plan.foods.length,
            variationsCreated: plan.counts.variations,
            optionsCreated: plan.counts.options,
        };
    });
}
