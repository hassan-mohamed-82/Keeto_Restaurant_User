"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertSubcategory = insertSubcategory;
exports.insertFood = insertFood;
// =============================================================================
// Shared insert logic for subcategories and foods.
//
// createSubcategory / createFood and the bulk Excel import all write through
// these helpers, so defaults and child rows (variations, options, branch menu
// items) are created the same way everywhere.
//
// The helpers only write. Validation that needs the request (image upload,
// "is the image required?") or that reports errors differently (HTTP 400 vs.
// per-row import errors) stays with the caller; the shared rules live in
// ./menu.rules.ts.
// =============================================================================
const drizzle_orm_1 = require("drizzle-orm");
const uuid_1 = require("uuid");
const BadRequest_1 = require("../Errors/BadRequest");
const schema_1 = require("../models/schema");
const pricing_overrides_1 = require("./pricing.overrides");
const weightPricing_helper_1 = require("./weightPricing.helper");
const menu_rules_1 = require("./menu.rules");
/** Inserts one subcategory for the restaurant and returns its id. */
async function insertSubcategory(executor, restaurantId, data) {
    const id = data.id ?? (0, uuid_1.v4)();
    await executor.insert(schema_1.subcategories).values({
        id,
        name: data.name,
        nameAr: data.nameAr,
        nameFr: data.nameFr,
        image: data.image,
        categoryId: data.categoryId,
        restaurantId,
        addonsIds: data.addonsIds || [],
        priority: data.priority || menu_rules_1.SUBCATEGORY_DEFAULTS.priority,
        order_Level: data.orderLevel !== undefined ? data.orderLevel : menu_rules_1.SUBCATEGORY_DEFAULTS.orderLevel,
        status: data.status || menu_rules_1.SUBCATEGORY_DEFAULTS.status,
    });
    return id;
}
/**
 * Inserts one food with its variations, variation options and branch menu
 * items, and returns the food id. Call it with a transaction so a failure in a
 * child row rolls back the food as well.
 */
async function insertFood(executor, restaurantId, data) {
    const foodId = data.id ?? (0, uuid_1.v4)();
    // Weight-group rules and the fixed-discount rule (same for manual create and the bulk import).
    if ((0, weightPricing_helper_1.isFixedDiscountOnGramFood)({
        soldBy: data.sold_by, weightUnit: data.weight_unit, discountType: data.discount_type, discountValue: data.discount_value,
    })) {
        throw new BadRequest_1.BadRequest(weightPricing_helper_1.FIXED_DISCOUNT_ON_GRAM_MESSAGE);
    }
    const weightConfig = (0, weightPricing_helper_1.validateWeightGroupConfig)({
        soldBy: data.sold_by || "unit",
        weightUnit: data.weight_unit,
        allowCustomWeight: data.allow_custom_weight,
        variations: data.variations || [],
    });
    await executor.insert(schema_1.food).values({
        id: foodId,
        name: data.name,
        nameAr: data.nameAr,
        nameFr: data.nameFr,
        description: data.description,
        descriptionAr: data.descriptionAr,
        descriptionFr: data.descriptionFr,
        image: data.image,
        restaurantid: restaurantId,
        categoryid: data.categoryid,
        subcategoryid: data.subcategoryid || null,
        foodtype: data.foodtype || menu_rules_1.FOOD_DEFAULTS.foodtype,
        Nutrition: data.Nutrition || null,
        allergen_ingredients: data.allergen_ingredients || null,
        is_Halal: data.is_Halal ?? menu_rules_1.FOOD_DEFAULTS.isHalal,
        addonsId: data.addonsIds,
        startTime: data.startTime || null,
        endTime: data.endTime || null,
        search_tags: data.search_tags || null,
        price: data.price,
        discount_type: data.discount_type || menu_rules_1.FOOD_DEFAULTS.discountType,
        discount_value: data.discount_value || null,
        Maximum_Purchase: data.Maximum_Purchase || null,
        stock_type: data.stock_type || menu_rules_1.FOOD_DEFAULTS.stockType,
        status: data.status || menu_rules_1.FOOD_DEFAULTS.status,
        isOutOfStock: data.isOutOfStock ?? menu_rules_1.FOOD_DEFAULTS.isOutOfStock,
        points: data.points ?? menu_rules_1.FOOD_DEFAULTS.points,
        order_level: data.order_level ?? 0,
        sold_by: data.sold_by || "unit",
        weight_unit: data.sold_by === "weight" ? (data.weight_unit || null) : null,
        allow_custom_weight: weightConfig.allowCustomWeight,
    });
    // Variations and their options
    const variations = data.variations;
    if (variations && Array.isArray(variations) && variations.length > 0) {
        for (const [variationIndex, variation] of variations.entries()) {
            const variationId = (0, uuid_1.v4)();
            const weightGroup = weightConfig.weightGroups.get(variationIndex);
            await executor.insert(schema_1.foodVariations).values({
                id: variationId,
                foodId,
                name: variation.name,
                nameAr: variation.nameAr,
                nameFr: variation.nameFr,
                isRequired: weightGroup ? weightGroup.isRequired : (variation.isRequired ?? menu_rules_1.VARIATION_DEFAULTS.isRequired),
                selectionType: weightGroup ? weightGroup.selectionType : (variation.selectionType || menu_rules_1.VARIATION_DEFAULTS.selectionType),
                min: weightGroup ? null : (variation.min || null),
                max: weightGroup ? null : (variation.max || null),
                isWeightGroup: Boolean(weightGroup),
            });
            if (variation.options && Array.isArray(variation.options)) {
                const optionsToInsert = variation.options.map((option, optionIndex) => {
                    const mode = option.priceMode || "fixed";
                    if (mode === "per_weight" && data.sold_by !== "weight") {
                        throw new BadRequest_1.BadRequest("per_weight price_mode is only allowed on weight-based products");
                    }
                    const addPrice = option.additionalPrice?.toString() || "0";
                    const p = parseFloat(addPrice);
                    if (isNaN(p) || p < 0) {
                        throw new BadRequest_1.BadRequest("Option additional price must be greater than or equal to 0");
                    }
                    return {
                        variationId,
                        optionName: option.optionName,
                        optionNameAr: option.optionNameAr,
                        optionNameFr: option.optionNameFr,
                        additionalPrice: addPrice,
                        priceMode: mode,
                        weightValue: weightConfig.weightValues.get(`${variationIndex}:${optionIndex}`) ?? null,
                    };
                });
                if (optionsToInsert.length > 0) {
                    await executor.insert(schema_1.variationOptions).values(optionsToInsert);
                }
            }
        }
    }
    // Branch menu items (only for branches that belong to this restaurant)
    const incomingBranches = data.branches;
    if (Array.isArray(incomingBranches) && incomingBranches.length > 0) {
        const restaurantBranches = await executor
            .select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId));
        const restaurantBranchIds = new Set(restaurantBranches.map((b) => b.id));
        for (const b of incomingBranches) {
            if (!b.branchId || !restaurantBranchIds.has(b.branchId))
                continue;
            await executor.insert(schema_1.branchMenuItems).values({
                id: (0, uuid_1.v4)(),
                branchId: b.branchId,
                foodId,
                status: b.status === "inactive" ? "inactive" : "active",
            });
            if (b.price !== undefined && b.price !== null && b.price !== "") {
                await (0, pricing_overrides_1.upsertFoodPricingOverride)(executor, {
                    foodId,
                    branchId: b.branchId,
                    serviceModule: null,
                    price: String(b.price),
                });
            }
        }
    }
    return foodId;
}
