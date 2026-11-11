// =============================================================================
// Shared business rules for creating subcategories and foods.
//
// Used by the manual endpoints (createSubcategory / createFood) and by the
// bulk Excel import, so both paths apply the same required fields, enum values,
// defaults and cross-entity rules. Enum values are read from the Drizzle schema
// so they can never drift from the database definition.
// =============================================================================
import { subcategories, food, foodVariations } from "../models/schema";

// ----------------------------------------------------------------------------
// Enum values (single source of truth: the schema)
// ----------------------------------------------------------------------------
export const MENU_ENUMS = {
    subcategoryPriority: subcategories.priority.enumValues,
    subcategoryStatus: subcategories.status.enumValues,
    foodType: food.foodtype.enumValues,
    discountType: food.discount_type.enumValues,
    stockType: food.stock_type.enumValues,
    foodStatus: food.status.enumValues,
    selectionType: foodVariations.selectionType.enumValues,
} as const;

export type SubcategoryPriority = (typeof MENU_ENUMS.subcategoryPriority)[number];
export type SubcategoryStatus = (typeof MENU_ENUMS.subcategoryStatus)[number];
export type FoodType = (typeof MENU_ENUMS.foodType)[number];
export type DiscountType = (typeof MENU_ENUMS.discountType)[number];
export type StockType = (typeof MENU_ENUMS.stockType)[number];
export type FoodStatus = (typeof MENU_ENUMS.foodStatus)[number];
export type SelectionType = (typeof MENU_ENUMS.selectionType)[number];

// ----------------------------------------------------------------------------
// Defaults applied when a value is not provided
// ----------------------------------------------------------------------------
export const SUBCATEGORY_DEFAULTS = {
    priority: "low",
    status: "active",
    orderLevel: 0,
} as const satisfies {
    priority: SubcategoryPriority;
    status: SubcategoryStatus;
    orderLevel: number;
};

export const FOOD_DEFAULTS = {
    foodtype: "veg",
    discountType: "percentage",
    stockType: "unlimited",
    status: "active",
    isHalal: false,
    isOutOfStock: false,
    points: 0,
} as const satisfies {
    foodtype: FoodType;
    discountType: DiscountType;
    stockType: StockType;
    status: FoodStatus;
    isHalal: boolean;
    isOutOfStock: boolean;
    points: number;
};

export const VARIATION_DEFAULTS = {
    isRequired: false,
    selectionType: "single",
} as const satisfies { isRequired: boolean; selectionType: SelectionType };

// ----------------------------------------------------------------------------
// Error messages (kept identical to the existing API responses)
// ----------------------------------------------------------------------------
export const MENU_MESSAGES = {
    subcategoryRequiredFields: "Subcategory name and category ID are required",
    categoryNotFound: "Category not found",
    subcategoryNotFound: "Subcategory not found",
    subcategoryAddonsInvalid: "One or more Addon IDs are invalid or do not belong to this restaurant",
    foodRequiredFields: "Missing required fields",
    foodAddonsInvalid: "One or more Addon IDs are invalid",
    activeFoodUnderInactiveSubcategory:
        "Cannot create an active food under an inactive subcategory. Please activate the subcategory first.",
} as const;

// ----------------------------------------------------------------------------
// Required fields
// ----------------------------------------------------------------------------
export const SUBCATEGORY_REQUIRED_FIELDS = ["name", "categoryId"] as const;
export type SubcategoryRequiredField = (typeof SUBCATEGORY_REQUIRED_FIELDS)[number];

export const FOOD_REQUIRED_FIELDS = [
    "name",
    "description",
    "image",
    "categoryid",
    "price",
] as const;
export type FoodRequiredField = (typeof FOOD_REQUIRED_FIELDS)[number];

/** A field counts as missing when it is falsy (the rule the create endpoints have always used). */
export function getMissingSubcategoryFields(
    input: Partial<Record<SubcategoryRequiredField, unknown>>
): SubcategoryRequiredField[] {
    return SUBCATEGORY_REQUIRED_FIELDS.filter((field) => !input[field]);
}

/**
 * `image` is required by the manual endpoint but optional in the bulk import,
 * so the caller decides through `requireImage`.
 */
export function getMissingFoodFields(
    input: Partial<Record<FoodRequiredField, unknown>>,
    options: { requireImage: boolean }
): FoodRequiredField[] {
    return FOOD_REQUIRED_FIELDS.filter(
        (field) => (field !== "image" || options.requireImage) && !input[field]
    );
}

// ----------------------------------------------------------------------------
// Cross-entity rules
// ----------------------------------------------------------------------------
/**
 * An active food (status defaults to "active") cannot be created under an
 * inactive subcategory.
 */
export function blocksActiveFoodUnderInactiveSubcategory(
    foodStatus: string | null | undefined,
    subcategoryStatus: string | null | undefined
): boolean {
    const effectiveFoodStatus = foodStatus || FOOD_DEFAULTS.status;
    return effectiveFoodStatus === "active" && subcategoryStatus === "inactive";
}
