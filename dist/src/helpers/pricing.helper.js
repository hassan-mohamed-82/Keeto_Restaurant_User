"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.productData = exports.product_form = exports.calculateCalculatedPrice = exports.resolveBranchIdFromAddress = void 0;
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const geo_1 = require("../utils/geo");
const BadRequest_1 = require("../Errors/BadRequest");
const NotFound_1 = require("../Errors/NotFound");
const pricing_overrides_1 = require("./pricing.overrides");
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
const resolveBranchIdFromAddress = async (addressId, restaurantId) => {
    // 1. Fetch the address lat/lng
    const [address] = await connection_1.db
        .select({ lat: schema_1.addresses.lat, lng: schema_1.addresses.lng, zoneId: schema_1.addresses.zoneId })
        .from(schema_1.addresses)
        .where((0, drizzle_orm_1.eq)(schema_1.addresses.id, addressId))
        .limit(1);
    if (!address) {
        throw new NotFound_1.NotFound("Delivery address not found.");
    }
    const lat = parseFloat(address.lat || "0");
    const lng = parseFloat(address.lng || "0");
    if (!lat || !lng) {
        throw new BadRequest_1.BadRequest("Delivery address requires valid latitude and longitude coordinates.");
    }
    // 2. Fetch all active delivery zones for this restaurant (with zone geometry)
    const restaurantFees = await connection_1.db
        .select({
        id: schema_1.restaurantZoneDeliveryFees.id,
        zoneId: schema_1.restaurantZoneDeliveryFees.zoneId,
        branchId: schema_1.restaurantZoneDeliveryFees.branchId,
        deliveryFee: schema_1.restaurantZoneDeliveryFees.deliveryFee,
        coverageType: schema_1.restaurantZoneDeliveryFees.coverageType,
        customCoordinates: schema_1.restaurantZoneDeliveryFees.customCoordinates,
        customRadiusKm: schema_1.restaurantZoneDeliveryFees.customRadiusKm,
        defaultCoordinates: schema_1.zones.coordinates,
        defaultRadiusKm: schema_1.zones.coverageAreaRadiusKm,
    })
        .from(schema_1.restaurantZoneDeliveryFees)
        .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.status, "active")));
    // 3. Find the best-matching zone (highest delivery fee that covers the address)
    let matchedFee = null;
    let maxDeliveryFee = -1;
    for (const fee of restaurantFees) {
        if ((0, geo_1.isLocationInZone)(lat, lng, fee.zoneId, fee)) {
            const currentFee = parseFloat(fee.deliveryFee || "0");
            if (matchedFee === null || currentFee > maxDeliveryFee) {
                maxDeliveryFee = currentFee;
                matchedFee = fee;
            }
        }
    }
    if (!matchedFee) {
        throw new BadRequest_1.BadRequest("Delivery is not available for your selected address. Please choose a different address or contact support.");
    }
    // 4a. Fee has a dedicated branch → use it
    if (matchedFee.branchId) {
        return matchedFee.branchId;
    }
    // 4b. No dedicated branch → find an active branch in that zone
    if (matchedFee.zoneId) {
        const [branch] = await connection_1.db
            .select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.zoneId, matchedFee.zoneId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")))
            .limit(1);
        if (branch)
            return branch.id;
    }
    throw new NotFound_1.NotFound("No active branch found serving your delivery zone. Please try again later.");
};
exports.resolveBranchIdFromAddress = resolveBranchIdFromAddress;
// ─────────────────────────────────────────────
// 2. calculateCalculatedPrice
// ─────────────────────────────────────────────
/**
 * Resolves the effective price for a food item + its selected variant options
 * from foodPricingOverrides / variantPricingOverrides + base prices.
 */
const calculateCalculatedPrice = async (foodId, variantOptionIds, branchId, serviceModule) => {
    const [foodRow, foodOverrides, branchMenuRow, variantOverrideRows, baseVariantRows] = await Promise.all([
        connection_1.db.select({ price: schema_1.food.price, status: schema_1.food.status, isOutOfStock: schema_1.food.isOutOfStock })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId))
            .limit(1),
        (0, pricing_overrides_1.fetchFoodOverrides)(connection_1.db, foodId, branchId, serviceModule),
        connection_1.db.select({
            status: schema_1.branchMenuItems.status,
            stockType: schema_1.branchMenuItems.stockType,
            stockQty: schema_1.branchMenuItems.stockQty,
        })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId)))
            .limit(1),
        (0, pricing_overrides_1.fetchVariantOverrides)(connection_1.db, variantOptionIds, branchId, serviceModule),
        variantOptionIds.length > 0
            ? connection_1.db.select({
                id: schema_1.variationOptions.id,
                additionalPrice: schema_1.variationOptions.additionalPrice,
                status: schema_1.variationOptions.status,
            })
                .from(schema_1.variationOptions)
                .where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.id, variantOptionIds))
            : Promise.resolve([]),
    ]);
    const foodData = foodRow[0];
    if (!foodData) {
        throw new NotFound_1.NotFound(`Food item not found: ${foodId}`);
    }
    const winningFoodOverride = (0, pricing_overrides_1.pickBestOverride)(foodOverrides);
    let basePrice = winningFoodOverride
        ? (0, pricing_overrides_1.parsePrice)(winningFoodOverride.price)
        : (0, pricing_overrides_1.parsePrice)(foodData.price);
    let isFoodAvailable = foodData.status !== "inactive" && !foodData.isOutOfStock;
    if (branchMenuRow.length > 0) {
        const row = branchMenuRow[0];
        if (row.status === "inactive")
            isFoodAvailable = false;
        if (row.stockType === "limited" && (row.stockQty ?? 0) <= 0)
            isFoodAvailable = false;
    }
    const resolvedVariants = [];
    let totalVariantPrice = 0;
    const overridesByVariant = new Map();
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
        const winning = (0, pricing_overrides_1.pickBestOverride)(overridesByVariant.get(optionId) ?? []);
        const varPrice = winning ? (0, pricing_overrides_1.parsePrice)(winning.price) : (0, pricing_overrides_1.parsePrice)(baseOption.additionalPrice);
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
exports.calculateCalculatedPrice = calculateCalculatedPrice;
const product_form = async (foodData, branchId, serviceModule, language = "En") => {
    const foodId = foodData.id;
    if (!foodData) {
        throw new NotFound_1.NotFound(`Food item not found: ${foodId}`);
    }
    const [foodOverrides, branchMenuRow] = await Promise.all([
        (0, pricing_overrides_1.fetchFoodOverrides)(connection_1.db, foodId, branchId, serviceModule),
        connection_1.db.select({
            status: schema_1.branchMenuItems.status,
            stockType: schema_1.branchMenuItems.stockType,
            stockQty: schema_1.branchMenuItems.stockQty,
        })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId)))
            .limit(1),
    ]);
    const winning = (0, pricing_overrides_1.pickBestOverride)(foodOverrides);
    const basePrice = winning ? (0, pricing_overrides_1.parsePrice)(winning.price) : (0, pricing_overrides_1.parsePrice)(foodData.price);
    let isFoodAvailable = foodData.status !== "inactive" && !foodData.isOutOfStock;
    if (branchMenuRow.length > 0) {
        const row = branchMenuRow[0];
        if (row.status === "inactive")
            isFoodAvailable = false;
        if (row.stockType === "limited" && (row.stockQty ?? 0) <= 0)
            isFoodAvailable = false;
    }
    return {
        id: foodData.id,
        name: language === "En" ? foodData.name : language === "Ar" ? foodData.nameAr : foodData.nameFr,
        image: foodData.image,
        basePrice,
        isAvailable: isFoodAvailable,
    };
};
exports.product_form = product_form;
const productData = async (foodId, branchId, serviceModule, language = "En", addonsIds = []) => {
    const [foodRow, foodOverrides, branchMenuRow, addonsRows, variantsDataRaw] = await Promise.all([
        connection_1.db.select({
            price: schema_1.food.price,
            status: schema_1.food.status,
            isOutOfStock: schema_1.food.isOutOfStock,
            name: schema_1.food.name,
            nameAr: schema_1.food.nameAr,
            nameFr: schema_1.food.nameFr,
            description: schema_1.food.description,
            descriptionAr: schema_1.food.descriptionAr,
            descriptionFr: schema_1.food.descriptionFr,
            image: schema_1.food.image,
            points: schema_1.food.points
        })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId))
            .limit(1),
        (0, pricing_overrides_1.fetchFoodOverrides)(connection_1.db, foodId, branchId, serviceModule),
        connection_1.db.select({
            status: schema_1.branchMenuItems.status,
            stockType: schema_1.branchMenuItems.stockType,
            stockQty: schema_1.branchMenuItems.stockQty,
        })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId)))
            .limit(1),
        // 5. Addons prices
        addonsIds.length > 0
            ? connection_1.db.select({
                id: schema_1.addons.id,
                name: language === "En" ? schema_1.addons.name : language === "Ar" ? schema_1.addons.nameAr : schema_1.addons.nameFr,
                price: schema_1.addons.price,
                status: schema_1.addons.status,
            })
                .from(schema_1.addons)
                .where((0, drizzle_orm_1.inArray)(schema_1.addons.id, addonsIds))
            : Promise.resolve([]),
        // 6. Food Variations الأساسية
        connection_1.db.select({
            id: schema_1.foodVariations.id,
            name: language === "En" ? schema_1.foodVariations.name : language === "Ar" ? schema_1.foodVariations.nameAr : schema_1.foodVariations.nameFr,
            isRequired: schema_1.foodVariations.isRequired,
            selectionType: schema_1.foodVariations.selectionType,
            min: schema_1.foodVariations.min,
            max: schema_1.foodVariations.max,
        })
            .from(schema_1.foodVariations)
            .where((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, foodId))
    ]);
    const foodData = foodRow[0];
    if (!foodData) {
        throw new NotFound_1.NotFound(`Food item not found: ${foodId}`);
    }
    // ─── المرحلة الثانية: جلب الخيارات (Options) الخاصة بالـ Variations ────
    const variantIds = variantsDataRaw.map(v => v.id);
    const variationOptionsRaw = variantIds.length > 0
        ? await connection_1.db.select({
            id: schema_1.variationOptions.id,
            variationId: schema_1.variationOptions.variationId,
            name: language === "En" ? schema_1.variationOptions.optionName : language === "Ar" ? schema_1.variationOptions.optionNameAr : schema_1.variationOptions.optionNameFr,
            additionalPrice: schema_1.variationOptions.additionalPrice,
            status: schema_1.variationOptions.status,
        })
            .from(schema_1.variationOptions)
            .where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, variantIds))
        : [];
    const variantOptionIds = variationOptionsRaw.map(o => o.id);
    const variantOverrideRows = await (0, pricing_overrides_1.fetchVariantOverrides)(connection_1.db, variantOptionIds, branchId, serviceModule);
    const winningFood = (0, pricing_overrides_1.pickBestOverride)(foodOverrides);
    let basePrice = winningFood ? (0, pricing_overrides_1.parsePrice)(winningFood.price) : (0, pricing_overrides_1.parsePrice)(foodData.price);
    let isFoodAvailable = foodData.status !== "inactive" && !foodData.isOutOfStock;
    if (branchMenuRow.length > 0) {
        const row = branchMenuRow[0];
        if (row.status === "inactive")
            isFoodAvailable = false;
        if (row.stockType === "limited" && (row.stockQty ?? 0) <= 0)
            isFoodAvailable = false;
    }
    const overridesByVariant = new Map();
    for (const row of variantOverrideRows) {
        const list = overridesByVariant.get(row.variantId) ?? [];
        list.push(row);
        overridesByVariant.set(row.variantId, list);
    }
    const resolvedVariants = [];
    const variantsData = variantsDataRaw.map(variant => {
        const optionsForVariant = variationOptionsRaw.filter(o => o.variationId === variant.id);
        const resolvedOptions = optionsForVariant.map(opt => {
            const winning = (0, pricing_overrides_1.pickBestOverride)(overridesByVariant.get(opt.id) ?? []);
            const varPrice = winning ? (0, pricing_overrides_1.parsePrice)(winning.price) : (0, pricing_overrides_1.parsePrice)(opt.additionalPrice);
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
exports.productData = productData;
