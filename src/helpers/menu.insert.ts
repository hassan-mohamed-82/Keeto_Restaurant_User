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
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "../models/connection";
import {
    subcategories,
    food,
    foodVariations,
    variationOptions,
    branches,
    branchMenuItems,
} from "../models/schema";
import { upsertFoodPricingOverride } from "./pricing.overrides";
import {
    FOOD_DEFAULTS,
    SUBCATEGORY_DEFAULTS,
    VARIATION_DEFAULTS,
    DiscountType,
    FoodStatus,
    FoodType,
    SelectionType,
    StockType,
    SubcategoryPriority,
    SubcategoryStatus,
} from "./menu.rules";

/** The `tx` object handed to a `db.transaction()` callback. */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Either the pool-backed `db` or an open transaction. */
export type DbExecutor = typeof db | DbTransaction;

// ----------------------------------------------------------------------------
// Subcategory
// ----------------------------------------------------------------------------
export interface SubcategoryInsertData {
    /** Optional pre-generated id; a uuid v4 is generated when omitted. */
    id?: string;
    name: string;
    categoryId: string;
    nameAr?: string | null;
    nameFr?: string | null;
    image?: string | null;
    addonsIds?: string[] | null;
    priority?: SubcategoryPriority | null;
    status?: SubcategoryStatus | null;
    /** `undefined` falls back to the default (0); `null` is stored as-is. */
    orderLevel?: number | null;
}

/** Inserts one subcategory for the restaurant and returns its id. */
export async function insertSubcategory(
    executor: DbExecutor,
    restaurantId: string,
    data: SubcategoryInsertData
): Promise<string> {
    const id = data.id ?? uuidv4();

    await executor.insert(subcategories).values({
        id,
        name: data.name,
        nameAr: data.nameAr,
        nameFr: data.nameFr,
        image: data.image,
        categoryId: data.categoryId,
        restaurantId,
        addonsIds: data.addonsIds || [],
        priority: data.priority || SUBCATEGORY_DEFAULTS.priority,
        order_Level: data.orderLevel !== undefined ? data.orderLevel : SUBCATEGORY_DEFAULTS.orderLevel,
        status: data.status || SUBCATEGORY_DEFAULTS.status,
    });

    return id;
}

// ----------------------------------------------------------------------------
// Food
// ----------------------------------------------------------------------------
export interface FoodVariationOptionInput {
    optionName: string;
    optionNameAr?: string;
    optionNameFr?: string;
    additionalPrice?: string | number | null;
}

export interface FoodVariationInput {
    name: string;
    nameAr?: string;
    nameFr?: string;
    isRequired?: boolean | null;
    selectionType?: SelectionType | null;
    min?: number | null;
    max?: number | null;
    options?: FoodVariationOptionInput[];
}

export interface FoodBranchInput {
    branchId?: string;
    status?: string;
    price?: string | number | null;
}

export interface FoodInsertData {
    /** Optional pre-generated id; a uuid v4 is generated when omitted. */
    id?: string;
    name: string;
    nameAr?: string;
    nameFr?: string;
    description: string;
    descriptionAr?: string;
    descriptionFr?: string;
    /** `food.image` is NOT NULL: pass "" when there is no image. */
    image: string;
    categoryid: string;
    subcategoryid?: string | null;
    foodtype?: FoodType | null;
    Nutrition?: string | null;
    allergen_ingredients?: string | null;
    is_Halal?: boolean | null;
    /** Already validated addon ids that belong to the restaurant. */
    addonsIds: string[];
    startTime: string;
    endTime: string;
    search_tags?: string | null;
    /** Decimal as a string, e.g. "12.50". */
    price: string;
    discount_type?: DiscountType | null;
    discount_value?: string | null;
    Maximum_Purchase?: number | null;
    stock_type?: StockType | null;
    status?: FoodStatus | null;
    isOutOfStock?: boolean | null;
    points?: number | null;
    variations?: FoodVariationInput[];
    /** Branch availability rows (branchMenuItems), optionally with a branch price. */
    branches?: FoodBranchInput[];
}

/**
 * Inserts one food with its variations, variation options and branch menu
 * items, and returns the food id. Call it with a transaction so a failure in a
 * child row rolls back the food as well.
 */
export async function insertFood(
    executor: DbExecutor,
    restaurantId: string,
    data: FoodInsertData
): Promise<string> {
    const foodId = data.id ?? uuidv4();

    await executor.insert(food).values({
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
        foodtype: data.foodtype || FOOD_DEFAULTS.foodtype,
        Nutrition: data.Nutrition || null,
        allergen_ingredients: data.allergen_ingredients || null,
        is_Halal: data.is_Halal ?? FOOD_DEFAULTS.isHalal,
        addonsId: data.addonsIds,
        startTime: data.startTime,
        endTime: data.endTime,
        search_tags: data.search_tags || null,
        price: data.price,
        discount_type: data.discount_type || FOOD_DEFAULTS.discountType,
        discount_value: data.discount_value || null,
        Maximum_Purchase: data.Maximum_Purchase || null,
        stock_type: data.stock_type || FOOD_DEFAULTS.stockType,
        status: data.status || FOOD_DEFAULTS.status,
        isOutOfStock: data.isOutOfStock ?? FOOD_DEFAULTS.isOutOfStock,
        points: data.points ?? FOOD_DEFAULTS.points,
    });

    // Variations and their options
    const variations = data.variations;
    if (variations && Array.isArray(variations) && variations.length > 0) {
        for (const variation of variations) {
            const variationId = uuidv4();

            await executor.insert(foodVariations).values({
                id: variationId,
                foodId,
                name: variation.name,
                nameAr: variation.nameAr,
                nameFr: variation.nameFr,
                isRequired: variation.isRequired ?? VARIATION_DEFAULTS.isRequired,
                selectionType: variation.selectionType || VARIATION_DEFAULTS.selectionType,
                min: variation.min || null,
                max: variation.max || null,
            });

            if (variation.options && Array.isArray(variation.options)) {
                const optionsToInsert = variation.options.map((option) => ({
                    variationId,
                    optionName: option.optionName,
                    optionNameAr: option.optionNameAr,
                    optionNameFr: option.optionNameFr,
                    additionalPrice: option.additionalPrice?.toString() || "0",
                }));

                if (optionsToInsert.length > 0) {
                    await executor.insert(variationOptions).values(optionsToInsert);
                }
            }
        }
    }

    // Branch menu items (only for branches that belong to this restaurant)
    const incomingBranches = data.branches;
    if (Array.isArray(incomingBranches) && incomingBranches.length > 0) {
        const restaurantBranches = await executor
            .select({ id: branches.id })
            .from(branches)
            .where(eq(branches.restaurantId, restaurantId));
        const restaurantBranchIds = new Set(restaurantBranches.map((b) => b.id));

        for (const b of incomingBranches) {
            if (!b.branchId || !restaurantBranchIds.has(b.branchId)) continue;
            await executor.insert(branchMenuItems).values({
                id: uuidv4(),
                branchId: b.branchId,
                foodId,
                status: b.status === "inactive" ? "inactive" : "active",
            });
            if (b.price !== undefined && b.price !== null && b.price !== "") {
                await upsertFoodPricingOverride(executor, {
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
