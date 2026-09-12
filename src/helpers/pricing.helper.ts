// src/helpers/pricing.helper.ts
/**
 * Multi-Tier Channel Pricing Engine
 *
 * Pricing cascade (single override source):
 *   1. foodPricingOverrides / variantPricingOverrides (branch + module)
 *   2. override (branch, module = NULL)
 *   3. override (branch = NULL, module)
 *   4. food.price / variationOptions.additionalPrice
 *
 * branchMenuItems is inventory/availability only (status, stockType, stockQty).
 */

import { db } from "../models/connection";
import {
    addresses,
    branches,
    food,
    variationOptions,
    restaurantZoneDeliveryFees,
    zones,
    addons,
    foodVariations,
    branchMenuItems,
} from "../models/schema";
import { eq, and, inArray } from "drizzle-orm";
import { isLocationInZone } from "../utils/geo";
import { BadRequest } from "../Errors/BadRequest";
import { NotFound } from "../Errors/NotFound";
import {
    fetchFoodOverrides,
    fetchVariantOverrides,
    parsePrice,
    pickBestOverride,
} from "./pricing.overrides";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type ServiceModule = "takeaway" | "dine_in" | "delivery";

export type VariantPriceResult = {
    variantOptionId: string;
    price: number;
    isAvailable: boolean;
};

export type CalculatedPriceResult = {
    /** Resolved base price after cascade */
    basePrice: number;
    /** false if any pricing tier marks the food as inactive/OOS */
    isAvailable: boolean;
    /** Per-variant resolution results */
    variants: VariantPriceResult[];
    /** basePrice + sum of variant prices */
    totalUnitPrice: number;
};

// ─────────────────────────────────────────────
// 1. resolveBranchIdFromAddress
// ─────────────────────────────────────────────

/**
 * Resolves the active branchId for a delivery order by geo-matching the
 * customer's address against the restaurant's `restaurant_zone_delivery_fees`.
 *
 * Priority:
 *  1. Fee record has an explicit branchId → use it directly.
 *  2. No explicit branchId → find an active branch in the same zone.
 *
 * Throws:
 *  - BadRequest  — address coordinates missing or outside delivery coverage.
 *  - NotFound    — no active branch found for the matched zone.
 */
export const resolveBranchIdFromAddress = async (
    addressId: string,
    restaurantId: string
): Promise<string> => {
    // 1. Fetch the address lat/lng
    const [address] = await db
        .select({ lat: addresses.lat, lng: addresses.lng, zoneId: addresses.zoneId })
        .from(addresses)
        .where(eq(addresses.id, addressId))
        .limit(1);

    if (!address) {
        throw new NotFound("Delivery address not found.");
    }

    const lat = parseFloat(address.lat || "0");
    const lng = parseFloat(address.lng || "0");

    if (!lat || !lng) {
        throw new BadRequest(
            "Delivery address requires valid latitude and longitude coordinates."
        );
    }

    // 2. Fetch all active delivery zones for this restaurant (with zone geometry)
    const restaurantFees = await db
        .select({
            id: restaurantZoneDeliveryFees.id,
            zoneId: restaurantZoneDeliveryFees.zoneId,
            branchId: restaurantZoneDeliveryFees.branchId,
            deliveryFee: restaurantZoneDeliveryFees.deliveryFee,
            coverageType: restaurantZoneDeliveryFees.coverageType,
            customCoordinates: restaurantZoneDeliveryFees.customCoordinates,
            customRadiusKm: restaurantZoneDeliveryFees.customRadiusKm,
            defaultCoordinates: zones.coordinates,
            defaultRadiusKm: zones.coverageAreaRadiusKm,
        })
        .from(restaurantZoneDeliveryFees)
        .leftJoin(zones, eq(restaurantZoneDeliveryFees.zoneId, zones.id))
        .where(
            and(
                eq(restaurantZoneDeliveryFees.restaurantId, restaurantId),
                eq(restaurantZoneDeliveryFees.status, "active")
            )
        );

    // 3. Find the best-matching zone (highest delivery fee that covers the address)
    let matchedFee: (typeof restaurantFees)[number] | null = null;
    let maxDeliveryFee = -1;

    for (const fee of restaurantFees) {
        if (isLocationInZone(lat, lng, fee.zoneId, fee)) {
            const currentFee = parseFloat((fee as any).deliveryFee || "0");
            if (matchedFee === null || currentFee > maxDeliveryFee) {
                maxDeliveryFee = currentFee;
                matchedFee = fee;
            }
        }
    }

    if (!matchedFee) {
        throw new BadRequest(
            "Delivery is not available for your selected address. Please choose a different address or contact support."
        );
    }

    // 4a. Fee has a dedicated branch → use it
    if (matchedFee.branchId) {
        return matchedFee.branchId;
    }

    // 4b. No dedicated branch → find an active branch in that zone
    if (matchedFee.zoneId) {
        const [branch] = await db
            .select({ id: branches.id })
            .from(branches)
            .where(
                and(
                    eq(branches.restaurantId, restaurantId),
                    eq(branches.zoneId, matchedFee.zoneId),
                    eq(branches.status, "active")
                )
            )
            .limit(1);

        if (branch) return branch.id;
    }

    throw new NotFound(
        "No active branch found serving your delivery zone. Please try again later."
    );
};

// ─────────────────────────────────────────────
// 2. calculateCalculatedPrice
// ─────────────────────────────────────────────

/**
 * Resolves the effective price for a food item + its selected variant options
 * from foodPricingOverrides / variantPricingOverrides + base prices.
 */
export const calculateCalculatedPrice = async (
    foodId: string,
    variantOptionIds: string[],
    branchId: string,
    serviceModule?: ServiceModule
): Promise<CalculatedPriceResult> => {
    const [foodRow, foodOverrides, branchMenuRow, variantOverrideRows, baseVariantRows] = await Promise.all([
        db.select({ price: food.price, status: food.status, isOutOfStock: food.isOutOfStock })
            .from(food)
            .where(eq(food.id, foodId))
            .limit(1),
        fetchFoodOverrides(db, foodId, branchId, serviceModule),
        db.select({
            status: branchMenuItems.status,
            stockType: branchMenuItems.stockType,
            stockQty: branchMenuItems.stockQty,
        })
            .from(branchMenuItems)
            .where(and(eq(branchMenuItems.foodId, foodId), eq(branchMenuItems.branchId, branchId)))
            .limit(1),
        fetchVariantOverrides(db, variantOptionIds, branchId, serviceModule),
        variantOptionIds.length > 0
            ? db.select({
                id: variationOptions.id,
                additionalPrice: variationOptions.additionalPrice,
                status: variationOptions.status,
            })
                .from(variationOptions)
                .where(inArray(variationOptions.id, variantOptionIds))
            : Promise.resolve([]),
    ]);

    const foodData = foodRow[0];
    if (!foodData) {
        throw new NotFound(`Food item not found: ${foodId}`);
    }

    const winningFoodOverride = pickBestOverride(foodOverrides);
    let basePrice = winningFoodOverride
        ? parsePrice(winningFoodOverride.price)
        : parsePrice(foodData.price as string);

    let isFoodAvailable = foodData.status !== "inactive" && !foodData.isOutOfStock;
    if (branchMenuRow.length > 0) {
        const row = branchMenuRow[0];
        if (row.status === "inactive") isFoodAvailable = false;
        if (row.stockType === "limited" && (row.stockQty ?? 0) <= 0) isFoodAvailable = false;
    }

    const resolvedVariants: VariantPriceResult[] = [];
    let totalVariantPrice = 0;
    const overridesByVariant = new Map<string, typeof variantOverrideRows>();
    for (const row of variantOverrideRows) {
        const list = overridesByVariant.get(row.variantId) ?? [];
        list.push(row);
        overridesByVariant.set(row.variantId, list);
    }
    const baseVarMap = new Map(baseVariantRows.map((r) => [r.id, r]));

    for (const optionId of variantOptionIds) {
        const baseOption = baseVarMap.get(optionId);
        if (!baseOption) {
            resolvedVariants.push({ variantOptionId: optionId, price: 0, isAvailable: false });
            continue;
        }

        const winning = pickBestOverride(overridesByVariant.get(optionId) ?? []);
        const varPrice = winning ? parsePrice(winning.price) : parsePrice(baseOption.additionalPrice as string);
        const varAvailable = baseOption.status !== false;

        totalVariantPrice += varPrice;
        resolvedVariants.push({
            variantOptionId: optionId,
            price: varPrice,
            isAvailable: varAvailable,
        });
    }

    const hasUnavailableVariant = resolvedVariants.some((v) => !v.isAvailable);

    return {
        basePrice,
        isAvailable: isFoodAvailable && !hasUnavailableVariant,
        variants: resolvedVariants,
        totalUnitPrice: basePrice + totalVariantPrice,
    };
};

export const product_form = async (
    foodData: any,
    branchId: string,
    serviceModule?: ServiceModule,
    language: "En" | "Ar" | "Fr" = "En",
) => {
    const foodId = foodData.id;

    if (!foodData) {
        throw new NotFound(`Food item not found: ${foodId}`);
    }

    const [foodOverrides, branchMenuRow] = await Promise.all([
        fetchFoodOverrides(db, foodId, branchId, serviceModule),
        db.select({
            status: branchMenuItems.status,
            stockType: branchMenuItems.stockType,
            stockQty: branchMenuItems.stockQty,
        })
            .from(branchMenuItems)
            .where(and(eq(branchMenuItems.foodId, foodId), eq(branchMenuItems.branchId, branchId)))
            .limit(1),
    ]);

    const winning = pickBestOverride(foodOverrides);
    const basePrice = winning ? parsePrice(winning.price) : parsePrice(foodData.price as string);
    let isFoodAvailable = foodData.status !== "inactive" && !foodData.isOutOfStock;
    if (branchMenuRow.length > 0) {
        const row = branchMenuRow[0];
        if (row.status === "inactive") isFoodAvailable = false;
        if (row.stockType === "limited" && (row.stockQty ?? 0) <= 0) isFoodAvailable = false;
    }

    return {
        id: foodData.id,
        name: language === "En" ? foodData.name : language === "Ar" ? foodData.nameAr : foodData.nameFr,
        image: foodData.image,
        basePrice,
        isAvailable: isFoodAvailable,
    };
};

export const productData = async (
    foodId: string, 
    branchId: string,
    serviceModule?: ServiceModule,
    language: "En" | "Ar" | "Fr" = "En",
    addonsIds: string[] = [],
) => {
    const [
        foodRow,
        foodOverrides,
        branchMenuRow,
        addonsRows,
        variantsDataRaw
    ] = await Promise.all([
        db.select({
            price: food.price,
            status: food.status,
            isOutOfStock: food.isOutOfStock,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            description: food.description,
            descriptionAr: food.descriptionAr,
            descriptionFr: food.descriptionFr,
            image: food.image,
            points: food.points
        })
        .from(food)
        .where(eq(food.id, foodId))
        .limit(1),

        fetchFoodOverrides(db, foodId, branchId, serviceModule),

        db.select({
            status: branchMenuItems.status,
            stockType: branchMenuItems.stockType,
            stockQty: branchMenuItems.stockQty,
        })
        .from(branchMenuItems)
        .where(
            and(
                eq(branchMenuItems.foodId, foodId),
                eq(branchMenuItems.branchId, branchId)
            )
        )
        .limit(1),

        // 5. Addons prices
        addonsIds.length > 0
            ? db.select({
                id: addons.id,
                name: language === "En" ? addons.name : language === "Ar" ? addons.nameAr : addons.nameFr,
                price: addons.price,
                status: addons.status,
            })
            .from(addons)
            .where(inArray(addons.id, addonsIds))
            : Promise.resolve([]),

        // 6. Food Variations الأساسية
        db.select({
            id: foodVariations.id,
            name: language === "En" ? foodVariations.name : language === "Ar" ? foodVariations.nameAr : foodVariations.nameFr,
            isRequired: foodVariations.isRequired,
            selectionType: foodVariations.selectionType,
            min: foodVariations.min,
            max: foodVariations.max,
        })
        .from(foodVariations)
        .where(eq(foodVariations.foodId, foodId))
    ]);

    const foodData = foodRow[0];
    if (!foodData) {
        throw new NotFound(`Food item not found: ${foodId}`);
    }

    // ─── المرحلة الثانية: جلب الخيارات (Options) الخاصة بالـ Variations ────
    const variantIds = variantsDataRaw.map(v => v.id);
    const variationOptionsRaw = variantIds.length > 0 
        ? await db.select({
            id: variationOptions.id,
            variationId: variationOptions.variationId,
            name: language === "En" ? variationOptions.optionName : language === "Ar" ? variationOptions.optionNameAr : variationOptions.optionNameFr,
            additionalPrice: variationOptions.additionalPrice,
            status: variationOptions.status,
        })
        .from(variationOptions)
        .where(inArray(variationOptions.variationId, variantIds))
        : [];

    const variantOptionIds = variationOptionsRaw.map(o => o.id);
    const variantOverrideRows = await fetchVariantOverrides(db, variantOptionIds, branchId, serviceModule);

    const winningFood = pickBestOverride(foodOverrides);
    let basePrice = winningFood ? parsePrice(winningFood.price) : parsePrice(foodData.price as string);
    let isFoodAvailable = foodData.status !== "inactive" && !foodData.isOutOfStock;

    if (branchMenuRow.length > 0) {
        const row = branchMenuRow[0];
        if (row.status === "inactive") isFoodAvailable = false;
        if (row.stockType === "limited" && (row.stockQty ?? 0) <= 0) isFoodAvailable = false;
    }

    const overridesByVariant = new Map<string, typeof variantOverrideRows>();
    for (const row of variantOverrideRows) {
        const list = overridesByVariant.get(row.variantId) ?? [];
        list.push(row);
        overridesByVariant.set(row.variantId, list);
    }

    const resolvedVariants: any[] = [];

    const variantsData = variantsDataRaw.map(variant => {
        const optionsForVariant = variationOptionsRaw.filter(o => o.variationId === variant.id);

        const resolvedOptions = optionsForVariant.map(opt => {
            const winning = pickBestOverride(overridesByVariant.get(opt.id) ?? []);
            const varPrice = winning ? parsePrice(winning.price) : parsePrice(opt.additionalPrice as string);
            const varAvailable = opt.status !== false;

            resolvedVariants.push({
                variantOptionId: opt.id,
                price: varPrice,
                isAvailable: varAvailable,
            });

            return {
                id: opt.id,
                name: opt.name,
                additionalPrice: varPrice,
                status: opt.status,
                isAvailable: varAvailable,
            };
        });

        return {
            ...variant,
            options: resolvedOptions
        };
    });

    const hasUnavailableVariant = resolvedVariants.some((v) => !v.isAvailable);

    // ─── إرجاع النتيجة النهائية ────────────────────────
    return {
        name: language === "En" ? foodData.name : language === "Ar" ? foodData.nameAr : foodData.nameFr,
        description: language === "En" ? foodData.description : language === "Ar" ? foodData.descriptionAr : foodData.descriptionFr,
        image: foodData.image,
        points: foodData.points,
        addons: addonsRows,
        basePrice,
        isAvailable: isFoodAvailable && !hasUnavailableVariant,
        variants: resolvedVariants, // مصفوفة مسطحة (Flat) تفيد في عمليات التحقق السريعة
        variantsData: variantsData, // المصفوفة الشجرية (Nested) اللي هتعرض منها الداتا في الـ Frontend
    };
};