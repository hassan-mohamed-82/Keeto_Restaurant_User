"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertVariantChannelPricing = exports.upsertProductChannelPricing = exports.getFoodForPricing = exports.getMenuWithDynamicPricing = exports.upsertFoodWithPricing = exports.getActiveBranchWithServiceModule = void 0;
exports.syncVariantPricing = syncVariantPricing;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const mysql_core_1 = require("drizzle-orm/mysql-core");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
const pricing_overrides_1 = require("../../helpers/pricing.overrides");
function parseArrayParam(param) {
    if (!param)
        return [];
    if (Array.isArray(param)) {
        return param
            .flatMap((p) => (typeof p === "string" ? p.split(",") : String(p)))
            .map((p) => String(p).trim())
            .filter(Boolean);
    }
    if (typeof param === "string") {
        return param
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
    }
    return [String(param).trim()].filter(Boolean);
}
// ============================================================================
// 1. HELPER: Sync Variant Branch Pricing & Channel Pricing
// ============================================================================
async function syncVariantPricing(tx, restaurantId, variants) {
    if (!variants || variants.length === 0)
        return;
    // Fetch all active branches for the restaurant
    const allBranches = await tx
        .select({ id: schema_1.branches.id })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
    const allBranchIds = allBranches.map((b) => b.id);
    for (const vOverride of variants) {
        const variantId = vOverride.variantId;
        if (!variantId)
            continue;
        if (vOverride.branches && vOverride.branches.length > 0) {
            const branchOverrideMap = new Map();
            for (const b of vOverride.branches) {
                if (b.branchId) {
                    const rawPrice = b.price;
                    const priceVal = (rawPrice !== undefined && rawPrice !== null && rawPrice !== "")
                        ? String(rawPrice)
                        : "0.00";
                    const statusVal = b.status === "inactive" ? "inactive" : "active";
                    branchOverrideMap.set(b.branchId, { price: priceVal, status: statusVal });
                }
            }
            for (const bId of allBranchIds) {
                if (!branchOverrideMap.has(bId))
                    continue;
                const override = branchOverrideMap.get(bId);
                await (0, pricing_overrides_1.upsertVariantPricingOverride)(tx, {
                    variantId,
                    branchId: bId,
                    serviceModule: null,
                    price: override.price,
                    status: override.status,
                });
            }
        }
        if (vOverride.channels && vOverride.channels.length > 0) {
            for (const chOverride of vOverride.channels) {
                await (0, pricing_overrides_1.upsertVariantPricingOverride)(tx, {
                    variantId,
                    branchId: chOverride.branchId || null,
                    serviceModule: chOverride.serviceModule,
                    price: String(chOverride.price ?? "0.00"),
                    status: chOverride.status === "inactive" ? "inactive" : "active",
                });
            }
        }
    }
}
// ============================================================================
// 1.5 CONTROLLER: Get Active Branch & Service Module (for frontend dropdown)
// ============================================================================
const getActiveBranchWithServiceModule = async (req, res) => {
    const restaurantId = req.user?.restaurantId?.trim() || null;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("No restaurant ID available in token");
    // Fetch only active branches
    const activeBranches = await connection_1.db
        .select({
        id: schema_1.branches.id,
        name: schema_1.branches.name,
    })
        .from(schema_1.branches)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
    const serviceModules = [
        { id: "dine_in", name: "Dine In" },
        { id: "takeaway", name: "Take Away" },
        { id: "delivery", name: "Delivery" }
    ];
    return (0, response_1.SuccessResponse)(res, {
        message: "Active branches fetched successfully",
        data: {
            activeBranches,
            serviceModules
        },
    });
};
exports.getActiveBranchWithServiceModule = getActiveBranchWithServiceModule;
// ============================================================================
// 2. CONTROLLER: Upsert Food With Branch & Channel Pricing
// ============================================================================
const upsertFoodWithPricing = async (req, res) => {
    const input = req.body;
    if (!input.restaurantId)
        throw new BadRequest_1.BadRequest("restaurantId is required");
    if (!input.name)
        throw new BadRequest_1.BadRequest("name is required");
    if (!input.categoryId)
        throw new BadRequest_1.BadRequest("categoryId is required");
    if (input.mainPrice === undefined || input.mainPrice === null)
        throw new BadRequest_1.BadRequest("mainPrice is required");
    const mainPriceStr = String(input.mainPrice);
    const result = await connection_1.db.transaction(async (tx) => {
        let foodId = input.id;
        // 1. Create or Update Base Food Record (Sets standard food.price)
        if (foodId) {
            const [existingFood] = await tx
                .select({ id: schema_1.food.id })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId))
                .limit(1);
            if (!existingFood)
                throw new NotFound_1.NotFound(`Food with ID ${foodId} not found`);
            await tx
                .update(schema_1.food)
                .set({
                name: input.name,
                nameAr: input.nameAr,
                nameFr: input.nameFr,
                description: input.description || "",
                descriptionAr: input.descriptionAr,
                descriptionFr: input.descriptionFr,
                image: input.image || "",
                categoryid: input.categoryId,
                subcategoryid: input.subcategoryId || null,
                price: mainPriceStr,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.food.id, foodId));
        }
        else {
            foodId = (0, uuid_1.v4)();
            await tx.insert(schema_1.food).values({
                id: foodId,
                name: input.name,
                nameAr: input.nameAr,
                nameFr: input.nameFr,
                description: input.description || "",
                descriptionAr: input.descriptionAr,
                descriptionFr: input.descriptionFr,
                image: input.image || "",
                restaurantid: input.restaurantId,
                categoryid: input.categoryId,
                subcategoryid: input.subcategoryId || null,
                price: mainPriceStr,
                startTime: "00:00",
                endTime: "23:59",
            });
        }
        // 2. Fetch all active branches for the restaurant
        const allBranches = await tx
            .select({ id: schema_1.branches.id })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, input.restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
        const allBranchIds = allBranches.map((b) => b.id);
        if (input.branches && input.branches.length > 0) {
            const branchOverrideMap = new Map();
            for (const b of input.branches) {
                if (b.branchId) {
                    const rawPrice = b.price;
                    const priceVal = (rawPrice !== undefined && rawPrice !== null && rawPrice !== "")
                        ? String(rawPrice)
                        : "0.00";
                    const statusVal = b.status === "inactive" ? "inactive" : "active";
                    branchOverrideMap.set(b.branchId, { price: priceVal, status: statusVal });
                }
            }
            for (const bId of allBranchIds) {
                if (!branchOverrideMap.has(bId))
                    continue;
                const override = branchOverrideMap.get(bId);
                await (0, pricing_overrides_1.upsertFoodPricingOverride)(tx, {
                    foodId,
                    branchId: bId,
                    serviceModule: null,
                    price: override.price,
                    status: override.status,
                });
                const [existingItem] = await tx
                    .select({ id: schema_1.branchMenuItems.id })
                    .from(schema_1.branchMenuItems)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, bId), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, foodId)))
                    .limit(1);
                if (existingItem) {
                    await tx
                        .update(schema_1.branchMenuItems)
                        .set({
                        status: override.status,
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.id, existingItem.id));
                }
                else {
                    await tx.insert(schema_1.branchMenuItems).values({
                        id: (0, uuid_1.v4)(),
                        branchId: bId,
                        foodId,
                        status: override.status,
                    });
                }
            }
        }
        if (input.channels && input.channels.length > 0) {
            for (const chOverride of input.channels) {
                await (0, pricing_overrides_1.upsertFoodPricingOverride)(tx, {
                    foodId,
                    branchId: chOverride.branchId || null,
                    serviceModule: chOverride.serviceModule,
                    price: String(chOverride.price ?? "0.00"),
                    status: chOverride.status === "inactive" ? "inactive" : "active",
                });
            }
        }
        // 5. Sync Variants Branch & Channel Pricing
        if (input.variants && input.variants.length > 0) {
            await syncVariantPricing(tx, input.restaurantId, input.variants);
        }
        return { foodId };
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Food and pricing saved successfully",
        data: result,
    });
};
exports.upsertFoodWithPricing = upsertFoodWithPricing;
// ============================================================================
// 3. CONTROLLER: Get Dynamic Menu with Pricing Hierarchy (User App & Admin)
// Supports single branch/module or collection of branchIds and serviceModules
// Priority: COALESCE(Branch_Module_Price, Global_Module_Price, Branch_Item_Price, Main_Base_Price)
// ============================================================================
const getMenuWithDynamicPricing = async (req, res) => {
    // 1. Extract IDs from req.query (with fallback to req.body or JWT token)
    let restaurantId = (req.query.restaurantId ||
        req.body?.restaurantId ||
        req.user?.restaurantId ||
        "")?.trim() || null;
    const branchParam = req.query.branchIds ||
        req.query.branchId ||
        req.body?.branchIds ||
        req.body?.branchId;
    const rawBranchIds = parseArrayParam(branchParam);
    if (rawBranchIds.length === 0 && req.user?.branchId) {
        rawBranchIds.push(req.user.branchId);
    }
    let branchIds = [];
    if (rawBranchIds.includes("all")) {
        if (!restaurantId && req.user?.id) {
            restaurantId = req.user.id;
        }
        if (restaurantId) {
            const allRestBranches = await connection_1.db
                .select({ id: schema_1.branches.id })
                .from(schema_1.branches)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
            branchIds = allRestBranches.map((b) => b.id);
        }
    }
    else if (rawBranchIds.length > 0) {
        const foundBranches = await connection_1.db
            .select({
            id: schema_1.branches.id,
            restaurantId: schema_1.branches.restaurantId,
            name: schema_1.branches.name,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.inArray)(schema_1.branches.id, rawBranchIds));
        if (foundBranches.length === 0)
            throw new NotFound_1.NotFound("Branch(es) not found");
        restaurantId = foundBranches[0].restaurantId;
        branchIds = foundBranches.map((b) => b.id);
    }
    const moduleParam = req.query.serviceModules ||
        req.query.serviceModule ||
        req.body?.serviceModules ||
        req.body?.serviceModule;
    let serviceModules = parseArrayParam(moduleParam);
    if (serviceModules.includes("all")) {
        serviceModules = ["takeaway", "dine_in", "delivery"];
    }
    const subcategoryId = (req.query.subcategoryId ||
        req.query.subCategoryId ||
        req.query.subcategoryid ||
        req.body?.subcategoryId)?.trim() || null;
    const categoryId = (req.query.categoryId ||
        req.query.categoryid ||
        req.body?.categoryId)?.trim() || null;
    const isSingleBranch = branchIds.length === 1;
    const isSingleModule = serviceModules.length === 1;
    const singleBranchId = isSingleBranch ? branchIds[0] : null;
    const singleModule = isSingleModule ? serviceModules[0] : undefined;
    const foodConditions = [
        (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId),
        (0, drizzle_orm_1.eq)(schema_1.food.status, "active"),
    ];
    if (subcategoryId) {
        foodConditions.push((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId));
    }
    if (categoryId) {
        foodConditions.push((0, drizzle_orm_1.eq)(schema_1.food.categoryid, categoryId));
    }
    // 3A. FAST PATH: Single Branch & Single Service Module -> SQL COALESCE join
    if (isSingleBranch && isSingleModule) {
        const branchModuleAlias = (0, mysql_core_1.alias)(schema_1.foodPricingOverrides, "fpo_bm");
        const branchOnlyAlias = (0, mysql_core_1.alias)(schema_1.foodPricingOverrides, "fpo_b");
        const moduleOnlyAlias = (0, mysql_core_1.alias)(schema_1.foodPricingOverrides, "fpo_m");
        const menuItems = await connection_1.db
            .select({
            id: schema_1.food.id,
            name: schema_1.food.name,
            nameAr: schema_1.food.nameAr,
            nameFr: schema_1.food.nameFr,
            description: schema_1.food.description,
            image: schema_1.food.image,
            categoryId: schema_1.food.categoryid,
            subcategoryId: schema_1.food.subcategoryid,
            mainBasePrice: schema_1.food.price,
            globalStatus: schema_1.food.status,
            globalIsOutOfStock: schema_1.food.isOutOfStock,
            points: schema_1.food.points,
            branchStatus: schema_1.branchMenuItems.status,
            branchStockType: schema_1.branchMenuItems.stockType,
            branchStockQty: schema_1.branchMenuItems.stockQty,
            branchOverridePrice: branchOnlyAlias.price,
            branchOverrideStatus: branchOnlyAlias.status,
            branchChannelPrice: branchModuleAlias.price,
            branchChannelStatus: branchModuleAlias.status,
            globalChannelPrice: moduleOnlyAlias.price,
            globalChannelStatus: moduleOnlyAlias.status,
            finalCalculatedPrice: (0, drizzle_orm_1.sql) `
                    COALESCE(
                        CASE WHEN ${branchModuleAlias.status} != 'inactive' THEN ${branchModuleAlias.price} ELSE NULL END,
                        CASE WHEN ${branchOnlyAlias.status} != 'inactive' THEN ${branchOnlyAlias.price} ELSE NULL END,
                        CASE WHEN ${moduleOnlyAlias.status} != 'inactive' THEN ${moduleOnlyAlias.price} ELSE NULL END,
                        ${schema_1.food.price}
                    )
                `,
        })
            .from(schema_1.food)
            .leftJoin(schema_1.branchMenuItems, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, schema_1.food.id), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, singleBranchId)))
            .leftJoin(branchModuleAlias, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(branchModuleAlias.foodId, schema_1.food.id), (0, drizzle_orm_1.eq)(branchModuleAlias.branchId, singleBranchId), (0, drizzle_orm_1.eq)(branchModuleAlias.serviceModule, singleModule)))
            .leftJoin(branchOnlyAlias, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(branchOnlyAlias.foodId, schema_1.food.id), (0, drizzle_orm_1.eq)(branchOnlyAlias.branchId, singleBranchId), (0, drizzle_orm_1.isNull)(branchOnlyAlias.serviceModule)))
            .leftJoin(moduleOnlyAlias, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(moduleOnlyAlias.foodId, schema_1.food.id), (0, drizzle_orm_1.isNull)(moduleOnlyAlias.branchId), (0, drizzle_orm_1.eq)(moduleOnlyAlias.serviceModule, singleModule)))
            .where((0, drizzle_orm_1.and)(...foodConditions));
        const foodIds = menuItems.map((item) => item.id);
        let variationsData = [];
        if (foodIds.length > 0) {
            const branchModuleVar = (0, mysql_core_1.alias)(schema_1.variantPricingOverrides, "vpo_bm");
            const branchOnlyVar = (0, mysql_core_1.alias)(schema_1.variantPricingOverrides, "vpo_b");
            const moduleOnlyVar = (0, mysql_core_1.alias)(schema_1.variantPricingOverrides, "vpo_m");
            variationsData = await connection_1.db
                .select({
                variationId: schema_1.foodVariations.id,
                foodId: schema_1.foodVariations.foodId,
                variationName: schema_1.foodVariations.name,
                isRequired: schema_1.foodVariations.isRequired,
                selectionType: schema_1.foodVariations.selectionType,
                optionId: schema_1.variationOptions.id,
                optionName: schema_1.variationOptions.optionName,
                optionNameAr: schema_1.variationOptions.optionNameAr,
                baseAdditionalPrice: schema_1.variationOptions.additionalPrice,
                baseOptionStatus: schema_1.variationOptions.status,
                branchModuleVarStatus: branchModuleVar.status,
                branchOnlyVarStatus: branchOnlyVar.status,
                moduleOnlyVarStatus: moduleOnlyVar.status,
                finalOptionPrice: (0, drizzle_orm_1.sql) `
                        COALESCE(
                            CASE WHEN ${branchModuleVar.status} != 'inactive' THEN ${branchModuleVar.price} ELSE NULL END,
                            CASE WHEN ${branchOnlyVar.status} != 'inactive' THEN ${branchOnlyVar.price} ELSE NULL END,
                            CASE WHEN ${moduleOnlyVar.status} != 'inactive' THEN ${moduleOnlyVar.price} ELSE NULL END,
                            ${schema_1.variationOptions.additionalPrice}
                        )
                    `,
            })
                .from(schema_1.foodVariations)
                .innerJoin(schema_1.variationOptions, (0, drizzle_orm_1.eq)(schema_1.variationOptions.variationId, schema_1.foodVariations.id))
                .leftJoin(branchModuleVar, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(branchModuleVar.variantId, schema_1.variationOptions.id), (0, drizzle_orm_1.eq)(branchModuleVar.branchId, singleBranchId), (0, drizzle_orm_1.eq)(branchModuleVar.serviceModule, singleModule)))
                .leftJoin(branchOnlyVar, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(branchOnlyVar.variantId, schema_1.variationOptions.id), (0, drizzle_orm_1.eq)(branchOnlyVar.branchId, singleBranchId), (0, drizzle_orm_1.isNull)(branchOnlyVar.serviceModule)))
                .leftJoin(moduleOnlyVar, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(moduleOnlyVar.variantId, schema_1.variationOptions.id), (0, drizzle_orm_1.isNull)(moduleOnlyVar.branchId), (0, drizzle_orm_1.eq)(moduleOnlyVar.serviceModule, singleModule)))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodVariations.status, true), (0, drizzle_orm_1.inArray)(schema_1.foodVariations.foodId, foodIds)));
        }
        const variationsByFoodId = {};
        for (const v of variationsData) {
            if (!variationsByFoodId[v.foodId]) {
                variationsByFoodId[v.foodId] = [];
            }
            let varGroup = variationsByFoodId[v.foodId].find((g) => g.id === v.variationId);
            if (!varGroup) {
                varGroup = {
                    id: v.variationId,
                    name: v.variationName,
                    isRequired: v.isRequired,
                    selectionType: v.selectionType,
                    options: [],
                };
                variationsByFoodId[v.foodId].push(varGroup);
            }
            let isOptionAvailable = Boolean(v.baseOptionStatus !== 0 && v.baseOptionStatus !== false);
            if (v.moduleOnlyVarStatus)
                isOptionAvailable = v.moduleOnlyVarStatus !== "inactive";
            if (v.branchOnlyVarStatus)
                isOptionAvailable = v.branchOnlyVarStatus !== "inactive";
            if (v.branchModuleVarStatus)
                isOptionAvailable = v.branchModuleVarStatus !== "inactive";
            varGroup.options.push({
                id: v.optionId,
                name: v.optionName,
                nameAr: v.optionNameAr,
                price: v.finalOptionPrice,
                isAvailable: isOptionAvailable,
            });
        }
        const finalMenu = menuItems.map((item) => {
            // Out of stock calculation: branch override or global food
            let isOutOfStock = Boolean(item.globalIsOutOfStock);
            if (item.branchStockType !== null && item.branchStockType !== undefined) {
                isOutOfStock = item.branchStockType === "limited" && (item.branchStockQty ?? 0) <= 0;
            }
            // Effective status hierarchy: branch+module -> branch -> module -> branchMenuItem -> global food
            let effectiveStatus = item.globalStatus || "active";
            if (item.branchStatus) {
                effectiveStatus = item.branchStatus;
            }
            if (item.globalChannelStatus) {
                effectiveStatus = item.globalChannelStatus;
            }
            if (item.branchOverrideStatus) {
                effectiveStatus = item.branchOverrideStatus;
            }
            if (item.branchChannelStatus) {
                effectiveStatus = item.branchChannelStatus;
            }
            const isAvailable = effectiveStatus === "active";
            return {
                id: item.id,
                name: item.name,
                nameAr: item.nameAr,
                nameFr: item.nameFr,
                description: item.description,
                image: item.image,
                categoryId: item.categoryId,
                subcategoryId: item.subcategoryId,
                mainBasePrice: item.mainBasePrice,
                points: item.points,
                status: effectiveStatus,
                isOutOfStock,
                isAvailable,
                branchOverridePrice: item.branchOverridePrice,
                branchChannelPrice: item.branchChannelPrice,
                globalChannelPrice: item.globalChannelPrice,
                finalCalculatedPrice: item.finalCalculatedPrice,
                variations: variationsByFoodId[item.id] || [],
            };
        });
        // ── Subcategory rollup ────────────────────────────────────────────────
        const uniqueSubcategoryIds = [
            ...new Set(finalMenu.map((item) => item.subcategoryId).filter(Boolean)),
        ];
        const subcategoryResult = [];
        if (uniqueSubcategoryIds.length > 0) {
            const allFoodsForRollup = await connection_1.db
                .select({
                subcategoryId: schema_1.food.subcategoryid,
                status: schema_1.food.status,
                isOutOfStock: schema_1.food.isOutOfStock,
            })
                .from(schema_1.food)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.food.subcategoryid, uniqueSubcategoryIds)));
            const rollupMap = {};
            for (const row of allFoodsForRollup) {
                const sid = row.subcategoryId;
                if (!rollupMap[sid]) {
                    rollupMap[sid] = { allInactive: true, allOutOfStock: true, hasProducts: false };
                }
                rollupMap[sid].hasProducts = true;
                if (row.status !== "inactive")
                    rollupMap[sid].allInactive = false;
                if (!row.isOutOfStock)
                    rollupMap[sid].allOutOfStock = false;
            }
            const branchSubcategoryStatusMap = {};
            const branchSubcategoryOosMap = {};
            if (singleBranchId) {
                const branchSubcatRows = await connection_1.db
                    .select({
                    subcategoryId: schema_1.branchSubcategories.subcategoryId,
                    branchStatus: schema_1.branchSubcategories.status,
                    branchIsOutOfStock: schema_1.branchSubcategories.isOutOfStock,
                })
                    .from(schema_1.branchSubcategories)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchSubcategories.branchId, singleBranchId), (0, drizzle_orm_1.inArray)(schema_1.branchSubcategories.subcategoryId, uniqueSubcategoryIds)));
                for (const row of branchSubcatRows) {
                    branchSubcategoryStatusMap[row.subcategoryId] = row.branchStatus;
                    branchSubcategoryOosMap[row.subcategoryId] = Boolean(row.branchIsOutOfStock);
                }
            }
            const subcategoryData = await connection_1.db
                .select({
                id: schema_1.subcategories.id,
                name: schema_1.subcategories.name,
                nameAr: schema_1.subcategories.nameAr,
                nameFr: schema_1.subcategories.nameFr,
                status: schema_1.subcategories.status,
                isOutOfStock: schema_1.subcategories.isOutOfStock,
            })
                .from(schema_1.subcategories)
                .where((0, drizzle_orm_1.inArray)(schema_1.subcategories.id, uniqueSubcategoryIds));
            for (const sub of subcategoryData) {
                const rollup = rollupMap[sub.id];
                const status = singleBranchId
                    ? (branchSubcategoryStatusMap[sub.id] ?? sub.status)
                    : sub.status;
                const branchOos = singleBranchId ? (branchSubcategoryOosMap[sub.id] ?? false) : false;
                const globalOos = Boolean(sub.isOutOfStock);
                const foodRollupOos = rollup?.hasProducts ? rollup.allOutOfStock : false;
                const isOutOfStock = branchOos || globalOos || foodRollupOos;
                subcategoryResult.push({
                    id: sub.id,
                    name: sub.name,
                    nameAr: sub.nameAr,
                    nameFr: sub.nameFr,
                    computedStatus: status,
                    isOutOfStock,
                });
            }
        }
        // ─────────────────────────────────────────────────────────────────────
        return (0, response_1.SuccessResponse)(res, {
            message: "Dynamic menu fetched successfully",
            data: {
                restaurantId,
                branchId: singleBranchId,
                branchIds,
                subcategoryId: subcategoryId || null,
                categoryId: categoryId || null,
                serviceModule: singleModule || "all",
                serviceModules,
                subcategories: subcategoryResult,
                menu: finalMenu,
            },
        });
    }
    // 3B. MULTI-BRANCH / MULTI-MODULE FILTER MODE:
    // Fetches base food items with matching channel & branch pricing collections
    const rawFoods = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        description: schema_1.food.description,
        image: schema_1.food.image,
        categoryId: schema_1.food.categoryid,
        subcategoryId: schema_1.food.subcategoryid,
        mainBasePrice: schema_1.food.price,
        globalStatus: schema_1.food.status,
        isOutOfStock: schema_1.food.isOutOfStock,
        points: schema_1.food.points,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)(...foodConditions));
    if (rawFoods.length === 0) {
        return (0, response_1.SuccessResponse)(res, {
            message: "No menu items found",
            data: {
                restaurantId,
                branchIds,
                serviceModules,
                menu: [],
            },
        });
    }
    const foodIds = rawFoods.map((f) => f.id);
    const branchStatusRows = branchIds.length > 0
        ? await connection_1.db
            .select({
            foodId: schema_1.branchMenuItems.foodId,
            branchId: schema_1.branchMenuItems.branchId,
            status: schema_1.branchMenuItems.status,
            stockType: schema_1.branchMenuItems.stockType,
            stockQty: schema_1.branchMenuItems.stockQty,
        })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.branchMenuItems.foodId, foodIds), (0, drizzle_orm_1.inArray)(schema_1.branchMenuItems.branchId, branchIds)))
        : [];
    // ✅ FIX: branchIds.length === 0 now explicitly means "global overrides
    // only" (branchId IS NULL) instead of "no filter at all" (which pulled
    // every branch's row and let pickBestOverride tie-break arbitrarily).
    const foodOverrideConditions = [(0, drizzle_orm_1.inArray)(schema_1.foodPricingOverrides.foodId, foodIds)];
    if (branchIds.length > 0) {
        foodOverrideConditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema_1.foodPricingOverrides.branchId, branchIds), (0, drizzle_orm_1.isNull)(schema_1.foodPricingOverrides.branchId)));
    }
    else {
        foodOverrideConditions.push((0, drizzle_orm_1.isNull)(schema_1.foodPricingOverrides.branchId));
    }
    if (serviceModules.length > 0) {
        foodOverrideConditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema_1.foodPricingOverrides.serviceModule, serviceModules), (0, drizzle_orm_1.isNull)(schema_1.foodPricingOverrides.serviceModule)));
    }
    const foodOverrideList = await connection_1.db
        .select({
        id: schema_1.foodPricingOverrides.id,
        foodId: schema_1.foodPricingOverrides.foodId,
        branchId: schema_1.foodPricingOverrides.branchId,
        serviceModule: schema_1.foodPricingOverrides.serviceModule,
        price: schema_1.foodPricingOverrides.price,
        status: schema_1.foodPricingOverrides.status,
    })
        .from(schema_1.foodPricingOverrides)
        .where((0, drizzle_orm_1.and)(...foodOverrideConditions));
    // Variations & Options
    const allVariations = await connection_1.db
        .select({
        id: schema_1.foodVariations.id,
        foodId: schema_1.foodVariations.foodId,
        name: schema_1.foodVariations.name,
        isRequired: schema_1.foodVariations.isRequired,
        selectionType: schema_1.foodVariations.selectionType,
    })
        .from(schema_1.foodVariations)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.foodVariations.status, true), (0, drizzle_orm_1.inArray)(schema_1.foodVariations.foodId, foodIds)));
    const varIds = allVariations.map((v) => v.id);
    const allOptions = varIds.length > 0
        ? await connection_1.db
            .select({
            id: schema_1.variationOptions.id,
            variationId: schema_1.variationOptions.variationId,
            optionName: schema_1.variationOptions.optionName,
            optionNameAr: schema_1.variationOptions.optionNameAr,
            additionalPrice: schema_1.variationOptions.additionalPrice,
            status: schema_1.variationOptions.status,
        })
            .from(schema_1.variationOptions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variationOptions.status, true), (0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, varIds)))
        : [];
    const optionIds = allOptions.map((o) => o.id);
    // ✅ FIX: same branch-filter bug as foodOverrideConditions above, fixed
    // the same way — branchIds.length === 0 restricts to branchId IS NULL
    // instead of skipping the branch filter entirely.
    const variantOverrideConditions = optionIds.length > 0 ? [(0, drizzle_orm_1.inArray)(schema_1.variantPricingOverrides.variantId, optionIds)] : [];
    if (optionIds.length > 0) {
        if (branchIds.length > 0) {
            variantOverrideConditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema_1.variantPricingOverrides.branchId, branchIds), (0, drizzle_orm_1.isNull)(schema_1.variantPricingOverrides.branchId)));
        }
        else {
            variantOverrideConditions.push((0, drizzle_orm_1.isNull)(schema_1.variantPricingOverrides.branchId));
        }
        if (serviceModules.length > 0) {
            variantOverrideConditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema_1.variantPricingOverrides.serviceModule, serviceModules), (0, drizzle_orm_1.isNull)(schema_1.variantPricingOverrides.serviceModule)));
        }
    }
    const variantOverrideList = optionIds.length > 0
        ? await connection_1.db
            .select({
            id: schema_1.variantPricingOverrides.id,
            variantId: schema_1.variantPricingOverrides.variantId,
            branchId: schema_1.variantPricingOverrides.branchId,
            serviceModule: schema_1.variantPricingOverrides.serviceModule,
            price: schema_1.variantPricingOverrides.price,
            status: schema_1.variantPricingOverrides.status,
        })
            .from(schema_1.variantPricingOverrides)
            .where((0, drizzle_orm_1.and)(...variantOverrideConditions))
        : [];
    // Assemble final menu
    const finalMenu = rawFoods.map((f) => {
        const itemOverrides = foodOverrideList.filter((b) => b.foodId === f.id);
        const itemBranchOverrides = itemOverrides.filter((b) => b.serviceModule == null);
        const itemChannels = itemOverrides.filter((b) => b.serviceModule != null);
        const singleBranch = branchIds.length === 1 ? branchIds[0] : null;
        const singleModule = serviceModules.length === 1 ? serviceModules[0] : null;
        const branchItem = singleBranch
            ? branchStatusRows.find((b) => b.foodId === f.id && b.branchId === singleBranch)
            : null;
        // 1. Calculate isOutOfStock
        let isOutOfStock = Boolean(f.isOutOfStock);
        if (branchItem && branchItem.stockType !== null && branchItem.stockType !== undefined) {
            isOutOfStock = branchItem.stockType === "limited" && (branchItem.stockQty ?? 0) <= 0;
        }
        // 2. Calculate effective status
        let effectiveStatus = f.globalStatus || "active";
        if (branchItem?.status) {
            effectiveStatus = branchItem.status;
        }
        const relevantOverrides = itemOverrides.filter((ov) => {
            const matchBranch = !ov.branchId || (singleBranch && ov.branchId === singleBranch);
            const matchModule = !ov.serviceModule || (singleModule && ov.serviceModule === singleModule);
            return matchBranch && matchModule;
        });
        const sortedOverrides = [...relevantOverrides].sort((a, b) => (0, pricing_overrides_1.overrideRank)(b) - (0, pricing_overrides_1.overrideRank)(a));
        if (sortedOverrides.length > 0 && sortedOverrides[0].status) {
            effectiveStatus = sortedOverrides[0].status;
        }
        // 3. Calculate isAvailable
        const isAvailable = effectiveStatus === "active";
        const itemVariations = allVariations
            .filter((v) => v.foodId === f.id)
            .map((v) => {
            const options = allOptions
                .filter((o) => o.variationId === v.id)
                .map((o) => {
                const optOverrides = variantOverrideList.filter((vc) => vc.variantId === o.id);
                const relevantOptOverrides = optOverrides.filter((ov) => {
                    const matchBranch = !ov.branchId || (singleBranch && ov.branchId === singleBranch);
                    const matchModule = !ov.serviceModule || (singleModule && ov.serviceModule === singleModule);
                    return matchBranch && matchModule;
                });
                const sortedOptOverrides = [...relevantOptOverrides].sort((a, b) => (0, pricing_overrides_1.overrideRank)(b) - (0, pricing_overrides_1.overrideRank)(a));
                const winning = (0, pricing_overrides_1.pickBestOverride)(relevantOptOverrides);
                let isOptAvailable = Boolean(o.status !== false && o.status !== 0);
                if (sortedOptOverrides.length > 0 && sortedOptOverrides[0].status) {
                    if (sortedOptOverrides[0].status === "inactive") {
                        isOptAvailable = false;
                    }
                }
                return {
                    id: o.id,
                    name: o.optionName,
                    nameAr: o.optionNameAr,
                    baseAdditionalPrice: o.additionalPrice,
                    price: winning?.price || o.additionalPrice,
                    channelPricing: optOverrides.filter((ov) => ov.serviceModule != null),
                    isAvailable: isOptAvailable,
                };
            });
            return {
                id: v.id,
                name: v.name,
                isRequired: v.isRequired,
                selectionType: v.selectionType,
                options,
            };
        });
        const winningFood = (0, pricing_overrides_1.pickBestOverride)(itemOverrides);
        return {
            id: f.id,
            name: f.name,
            nameAr: f.nameAr,
            nameFr: f.nameFr,
            description: f.description,
            image: f.image,
            categoryId: f.categoryId,
            subcategoryId: f.subcategoryId,
            mainBasePrice: f.mainBasePrice,
            points: f.points,
            status: effectiveStatus,
            isOutOfStock,
            isAvailable,
            branchOverrides: itemBranchOverrides,
            channelPricing: itemChannels,
            finalCalculatedPrice: winningFood?.price || f.mainBasePrice,
            variations: itemVariations,
        };
    });
    // ── Subcategory rollup (multi-branch path) ────────────────────────────────
    const uniqueSubcategoryIds = [
        ...new Set(finalMenu.map((item) => item.subcategoryId).filter(Boolean)),
    ];
    const subcategoryResult = [];
    if (uniqueSubcategoryIds.length > 0) {
        const allFoodsForRollup = await connection_1.db
            .select({
            subcategoryId: schema_1.food.subcategoryid,
            status: schema_1.food.status,
            isOutOfStock: schema_1.food.isOutOfStock,
        })
            .from(schema_1.food)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.food.subcategoryid, uniqueSubcategoryIds)));
        const rollupMap = {};
        for (const row of allFoodsForRollup) {
            const sid = row.subcategoryId;
            if (!rollupMap[sid]) {
                rollupMap[sid] = { allInactive: true, allOutOfStock: true, hasProducts: false };
            }
            rollupMap[sid].hasProducts = true;
            if (row.status !== "inactive")
                rollupMap[sid].allInactive = false;
            if (!row.isOutOfStock)
                rollupMap[sid].allOutOfStock = false;
        }
        const branchStatusMap = {};
        const branchOosMap = {};
        if (branchIds.length > 0) {
            const branchSubcatRows = await connection_1.db
                .select({
                subcategoryId: schema_1.branchSubcategories.subcategoryId,
                branchId: schema_1.branchSubcategories.branchId,
                branchStatus: schema_1.branchSubcategories.status,
                branchIsOutOfStock: schema_1.branchSubcategories.isOutOfStock,
            })
                .from(schema_1.branchSubcategories)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.branchSubcategories.branchId, branchIds), (0, drizzle_orm_1.inArray)(schema_1.branchSubcategories.subcategoryId, uniqueSubcategoryIds)));
            for (const row of branchSubcatRows) {
                if (!branchStatusMap[row.subcategoryId]) {
                    branchStatusMap[row.subcategoryId] = {};
                    branchOosMap[row.subcategoryId] = {};
                }
                branchStatusMap[row.subcategoryId][row.branchId] = row.branchStatus;
                branchOosMap[row.subcategoryId][row.branchId] = Boolean(row.branchIsOutOfStock);
            }
        }
        const subcategoryData = await connection_1.db
            .select({
            id: schema_1.subcategories.id,
            name: schema_1.subcategories.name,
            nameAr: schema_1.subcategories.nameAr,
            nameFr: schema_1.subcategories.nameFr,
            status: schema_1.subcategories.status,
            isOutOfStock: schema_1.subcategories.isOutOfStock,
        })
            .from(schema_1.subcategories)
            .where((0, drizzle_orm_1.inArray)(schema_1.subcategories.id, uniqueSubcategoryIds));
        for (const sub of subcategoryData) {
            const rollup = rollupMap[sub.id];
            const branchStatuses = branchStatusMap[sub.id] ?? {};
            const branchOoses = branchOosMap[sub.id] ?? {};
            const singleBranch = branchIds.length === 1 ? branchIds[0] : null;
            const status = singleBranch
                ? (branchStatuses[singleBranch] ?? sub.status)
                : sub.status;
            const branchOos = singleBranch ? (branchOoses[singleBranch] ?? false) : false;
            const globalOos = Boolean(sub.isOutOfStock);
            const foodRollupOos = rollup?.hasProducts ? rollup.allOutOfStock : false;
            const isOutOfStock = branchOos || globalOos || foodRollupOos;
            subcategoryResult.push({
                id: sub.id,
                name: sub.name,
                nameAr: sub.nameAr,
                nameFr: sub.nameFr,
                computedStatus: status,
                isOutOfStock,
            });
        }
    }
    // ─────────────────────────────────────────────────────────────────────────
    return (0, response_1.SuccessResponse)(res, {
        message: "Dynamic menu fetched successfully",
        data: {
            restaurantId,
            branchIds,
            serviceModules,
            subcategoryId: subcategoryId || null,
            categoryId: categoryId || null,
            subcategories: subcategoryResult,
            menu: finalMenu,
        },
    });
};
exports.getMenuWithDynamicPricing = getMenuWithDynamicPricing;
// ============================================================================
// 4. CONTROLLER: Get Food List for Pricing UI (food + variations + options)
// GET /pricing/food-for-pricing
// ============================================================================
const getFoodForPricing = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const rawFoods = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        nameFr: schema_1.food.nameFr,
        price: schema_1.food.price,
        status: schema_1.food.status,
    })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId));
    if (rawFoods.length === 0) {
        return (0, response_1.SuccessResponse)(res, { message: "No foods found", data: [] });
    }
    const foodIds = rawFoods.map((f) => f.id);
    const allVariations = await connection_1.db
        .select({
        id: schema_1.foodVariations.id,
        foodId: schema_1.foodVariations.foodId,
        name: schema_1.foodVariations.name,
        nameAr: schema_1.foodVariations.nameAr,
        isRequired: schema_1.foodVariations.isRequired,
        selectionType: schema_1.foodVariations.selectionType,
    })
        .from(schema_1.foodVariations)
        .where((0, drizzle_orm_1.eq)(schema_1.foodVariations.status, true));
    const varIds = allVariations.map((v) => v.id);
    const allOptions = varIds.length > 0
        ? await connection_1.db
            .select({
            id: schema_1.variationOptions.id,
            variationId: schema_1.variationOptions.variationId,
            optionName: schema_1.variationOptions.optionName,
            optionNameAr: schema_1.variationOptions.optionNameAr,
            additionalPrice: schema_1.variationOptions.additionalPrice,
        })
            .from(schema_1.variationOptions)
            .where((0, drizzle_orm_1.eq)(schema_1.variationOptions.status, true))
        : [];
    const result = rawFoods.map((f) => {
        const variations = allVariations
            .filter((v) => v.foodId === f.id)
            .map((v) => ({
            ...v,
            options: allOptions.filter((o) => o.variationId === v.id),
        }));
        return { ...f, variations };
    });
    return (0, response_1.SuccessResponse)(res, { message: "Food list for pricing fetched", data: result });
};
exports.getFoodForPricing = getFoodForPricing;
// ============================================================================
// 5. CONTROLLER: Upsert Product Channel Pricing
// POST /pricing/product-channel
// Body: { foodId, branchId: string | string[] | null, serviceModule: string | string[], price, status } or array of objects
// ============================================================================
const upsertProductChannelPricing = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    await connection_1.db.transaction(async (tx) => {
        for (const entry of entries) {
            const foodId = (entry.foodId || "")?.trim();
            if (!foodId)
                throw new BadRequest_1.BadRequest("foodId is required");
            if (entry.price === undefined || entry.price === null || entry.price === "")
                throw new BadRequest_1.BadRequest("price is required");
            // branchId can be an array of branch IDs, "all" / null / undefined / "global" (single global record where branch_id = null), or single branch ID
            const rawBranch = entry.branchId;
            let targetBranches;
            if (rawBranch === undefined || rawBranch === null || rawBranch === "" || rawBranch === "global") {
                targetBranches = [null];
            }
            else {
                const parsedBranches = parseArrayParam(rawBranch);
                if (parsedBranches.includes("all") || parsedBranches.length === 0) {
                    targetBranches = [null];
                }
                else {
                    targetBranches = parsedBranches;
                }
            }
            // serviceModule can be an array ("takeaway", "delivery"), single string, or "all" / null / undefined (single global record where service_module = null)
            const rawModule = entry.serviceModule;
            let targetModules;
            if (rawModule === undefined || rawModule === null || rawModule === "" || rawModule === "all") {
                targetModules = [null];
            }
            else {
                const parsedModules = parseArrayParam(rawModule);
                if (parsedModules.includes("all") || parsedModules.length === 0) {
                    targetModules = [null];
                }
                else {
                    targetModules = parsedModules;
                }
            }
            const priceVal = String(entry.price);
            const statusVal = entry.status === "inactive" ? "inactive" : "active";
            for (const targetBranchId of targetBranches) {
                for (const module of targetModules) {
                    await (0, pricing_overrides_1.upsertFoodPricingOverride)(tx, {
                        foodId,
                        branchId: targetBranchId,
                        serviceModule: module,
                        price: priceVal,
                        status: statusVal,
                    });
                }
            }
        }
    });
    return (0, response_1.SuccessResponse)(res, { message: "Product channel pricing saved successfully" });
};
exports.upsertProductChannelPricing = upsertProductChannelPricing;
// ============================================================================
// 6. CONTROLLER: Upsert Variant Channel Pricing
// POST /pricing/variant-channel
// Body: { variantId, branchId: string | string[] | null, serviceModule: string | string[], price, status } or array of objects
// ============================================================================
const upsertVariantChannelPricing = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    await connection_1.db.transaction(async (tx) => {
        for (const entry of entries) {
            const variantId = (entry.variantId || "")?.trim();
            if (!variantId)
                throw new BadRequest_1.BadRequest("variantId is required");
            if (entry.price === undefined || entry.price === null || entry.price === "")
                throw new BadRequest_1.BadRequest("price is required");
            // branchId can be an array of branch IDs, "all" / null / undefined / "global" (single global record where branch_id = null), or single branch ID
            const rawBranch = entry.branchId;
            let targetBranches;
            if (rawBranch === undefined || rawBranch === null || rawBranch === "" || rawBranch === "global") {
                targetBranches = [null];
            }
            else {
                const parsedBranches = parseArrayParam(rawBranch);
                if (parsedBranches.includes("all") || parsedBranches.length === 0) {
                    targetBranches = [null];
                }
                else {
                    targetBranches = parsedBranches;
                }
            }
            // serviceModule can be an array ("takeaway", "delivery"), single string, or "all" / null / undefined (single global record where service_module = null)
            const rawModule = entry.serviceModule;
            let targetModules;
            if (rawModule === undefined || rawModule === null || rawModule === "" || rawModule === "all") {
                targetModules = [null];
            }
            else {
                const parsedModules = parseArrayParam(rawModule);
                if (parsedModules.includes("all") || parsedModules.length === 0) {
                    targetModules = [null];
                }
                else {
                    targetModules = parsedModules;
                }
            }
            const priceVal = String(entry.price);
            const statusVal = entry.status === "inactive" ? "inactive" : "active";
            for (const targetBranchId of targetBranches) {
                for (const module of targetModules) {
                    await (0, pricing_overrides_1.upsertVariantPricingOverride)(tx, {
                        variantId,
                        branchId: targetBranchId,
                        serviceModule: module,
                        price: priceVal,
                        status: statusVal,
                    });
                }
            }
        }
    });
    return (0, response_1.SuccessResponse)(res, { message: "Variant channel pricing saved successfully" });
};
exports.upsertVariantChannelPricing = upsertVariantChannelPricing;
