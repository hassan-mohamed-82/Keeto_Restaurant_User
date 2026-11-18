"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FOOD_REQUIRED_FIELDS = exports.SUBCATEGORY_REQUIRED_FIELDS = exports.MENU_MESSAGES = exports.VARIATION_DEFAULTS = exports.FOOD_DEFAULTS = exports.SUBCATEGORY_DEFAULTS = exports.MENU_ENUMS = void 0;
exports.getMissingSubcategoryFields = getMissingSubcategoryFields;
exports.getMissingFoodFields = getMissingFoodFields;
exports.blocksActiveFoodUnderInactiveSubcategory = blocksActiveFoodUnderInactiveSubcategory;
// =============================================================================
// Shared business rules for creating subcategories and foods.
//
// Used by the manual endpoints (createSubcategory / createFood) and by the
// bulk Excel import, so both paths apply the same required fields, enum values,
// defaults and cross-entity rules. Enum values are read from the Drizzle schema
// so they can never drift from the database definition.
// =============================================================================
const schema_1 = require("../models/schema");
// ----------------------------------------------------------------------------
// Enum values (single source of truth: the schema)
// ----------------------------------------------------------------------------
exports.MENU_ENUMS = {
    subcategoryPriority: schema_1.subcategories.priority.enumValues,
    subcategoryStatus: schema_1.subcategories.status.enumValues,
    foodType: schema_1.food.foodtype.enumValues,
    discountType: schema_1.food.discount_type.enumValues,
    stockType: schema_1.food.stock_type.enumValues,
    foodStatus: schema_1.food.status.enumValues,
    selectionType: schema_1.foodVariations.selectionType.enumValues,
    soldBy: schema_1.food.sold_by.enumValues,
    weightUnit: schema_1.food.weight_unit.enumValues,
    priceMode: schema_1.variationOptions.priceMode.enumValues,
};
// ----------------------------------------------------------------------------
// Defaults applied when a value is not provided
// ----------------------------------------------------------------------------
exports.SUBCATEGORY_DEFAULTS = {
    priority: "low",
    status: "active",
    orderLevel: 0,
};
exports.FOOD_DEFAULTS = {
    foodtype: "veg",
    discountType: "percentage",
    stockType: "unlimited",
    status: "active",
    isHalal: false,
    isOutOfStock: false,
    points: 0,
};
exports.VARIATION_DEFAULTS = {
    isRequired: false,
    selectionType: "single",
};
// ----------------------------------------------------------------------------
// Error messages (kept identical to the existing API responses)
// ----------------------------------------------------------------------------
exports.MENU_MESSAGES = {
    subcategoryRequiredFields: "Subcategory name and category ID are required",
    categoryNotFound: "Category not found",
    subcategoryNotFound: "Subcategory not found",
    subcategoryAddonsInvalid: "One or more Addon IDs are invalid or do not belong to this restaurant",
    foodRequiredFields: "Missing required fields",
    foodAddonsInvalid: "One or more Addon IDs are invalid",
    activeFoodUnderInactiveSubcategory: "Cannot create an active food under an inactive subcategory. Please activate the subcategory first.",
};
// ----------------------------------------------------------------------------
// Required fields
// ----------------------------------------------------------------------------
exports.SUBCATEGORY_REQUIRED_FIELDS = ["name", "categoryId"];
exports.FOOD_REQUIRED_FIELDS = [
    "name",
    "description",
    "image",
    "categoryid",
    "price",
];
/** A field counts as missing when it is falsy (the rule the create endpoints have always used). */
function getMissingSubcategoryFields(input) {
    return exports.SUBCATEGORY_REQUIRED_FIELDS.filter((field) => !input[field]);
}
/**
 * `image` is required by the manual endpoint but optional in the bulk import,
 * so the caller decides through `requireImage`.
 */
function getMissingFoodFields(input, options) {
    return exports.FOOD_REQUIRED_FIELDS.filter((field) => (field !== "image" || options.requireImage) && !input[field]);
}
// ----------------------------------------------------------------------------
// Cross-entity rules
// ----------------------------------------------------------------------------
/**
 * An active food (status defaults to "active") cannot be created under an
 * inactive subcategory.
 */
function blocksActiveFoodUnderInactiveSubcategory(foodStatus, subcategoryStatus) {
    const effectiveFoodStatus = foodStatus || exports.FOOD_DEFAULTS.status;
    return effectiveFoodStatus === "active" && subcategoryStatus === "inactive";
}
