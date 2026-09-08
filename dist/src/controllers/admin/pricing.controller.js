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
        // Only save branchVariantPricing if branches array is provided and non-empty
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
            // Apply overrides only for provided branches
            for (const bId of allBranchIds) {
                if (!branchOverrideMap.has(bId))
                    continue;
                const override = branchOverrideMap.get(bId);
                const [existing] = await tx
                    .select({ id: schema_1.branchVariantPricing.id })
                    .from(schema_1.branchVariantPricing)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchVariantPricing.branchId, bId), (0, drizzle_orm_1.eq)(schema_1.branchVariantPricing.variantId, variantId)))
                    .limit(1);
                if (existing) {
                    await tx
                        .update(schema_1.branchVariantPricing)
                        .set({
                        price: override.price,
                        status: override.status,
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.branchVariantPricing.id, existing.id));
                }
                else {
                    await tx.insert(schema_1.branchVariantPricing).values({
                        id: (0, uuid_1.v4)(),
                        branchId: bId,
                        variantId,
                        price: override.price,
                        status: override.status,
                    });
                }
            }
        }
        // Channel Pricing Overrides for Variants (Takeaway, Dine-In, Delivery)
        if (vOverride.channels && vOverride.channels.length > 0) {
            for (const chOverride of vOverride.channels) {
                const targetBranchId = chOverride.branchId || null;
                const serviceModule = chOverride.serviceModule;
                const priceVal = String(chOverride.price ?? "0.00");
                const statusVal = chOverride.status === "inactive" ? "inactive" : "active";
                const whereClause = targetBranchId
                    ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.variantId, variantId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.branchId, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.serviceModule, serviceModule))
                    : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.variantId, variantId), (0, drizzle_orm_1.isNull)(schema_1.variantChannelPricing.branchId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.serviceModule, serviceModule));
                const [existingCh] = await tx
                    .select({ id: schema_1.variantChannelPricing.id })
                    .from(schema_1.variantChannelPricing)
                    .where(whereClause)
                    .limit(1);
                if (existingCh) {
                    await tx
                        .update(schema_1.variantChannelPricing)
                        .set({
                        price: priceVal,
                        status: statusVal,
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.id, existingCh.id));
                }
                else {
                    await tx.insert(schema_1.variantChannelPricing).values({
                        id: (0, uuid_1.v4)(),
                        variantId,
                        branchId: targetBranchId,
                        serviceModule,
                        price: priceVal,
                        status: statusVal,
                    });
                }
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
        // 3. Process Branch Menu Overrides (branch_menu_items)
        // Only save to branchMenuItems if branches array is provided and non-empty
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
            // Upsert into branch_menu_items only for provided branches
            for (const bId of allBranchIds) {
                if (!branchOverrideMap.has(bId))
                    continue; // skip branches not in the input
                const override = branchOverrideMap.get(bId);
                const [existingItem] = await tx
                    .select({ id: schema_1.branchMenuItems.id })
                    .from(schema_1.branchMenuItems)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, bId), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, foodId)))
                    .limit(1);
                if (existingItem) {
                    await tx
                        .update(schema_1.branchMenuItems)
                        .set({
                        price: override.price,
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
                        price: override.price,
                        status: override.status,
                    });
                }
            }
        }
        // 4. Process Product Channel Pricing Overrides (product_channel_pricing)
        if (input.channels && input.channels.length > 0) {
            for (const chOverride of input.channels) {
                const targetBranchId = chOverride.branchId || null;
                const serviceModule = chOverride.serviceModule;
                const priceVal = String(chOverride.price ?? "0.00");
                const statusVal = chOverride.status === "inactive" ? "inactive" : "active";
                const whereClause = targetBranchId
                    ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.branchId, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.serviceModule, serviceModule))
                    : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.foodId, foodId), (0, drizzle_orm_1.isNull)(schema_1.productChannelPricing.branchId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.serviceModule, serviceModule));
                const [existingCh] = await tx
                    .select({ id: schema_1.productChannelPricing.id })
                    .from(schema_1.productChannelPricing)
                    .where(whereClause)
                    .limit(1);
                if (existingCh) {
                    await tx
                        .update(schema_1.productChannelPricing)
                        .set({
                        price: priceVal,
                        status: statusVal,
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.id, existingCh.id));
                }
                else {
                    await tx.insert(schema_1.productChannelPricing).values({
                        id: (0, uuid_1.v4)(),
                        foodId,
                        branchId: targetBranchId,
                        serviceModule,
                        price: priceVal,
                        status: statusVal,
                    });
                }
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
        const branchChannelPricingAlias = (0, mysql_core_1.alias)(schema_1.productChannelPricing, "b_channel");
        const globalChannelPricingAlias = (0, mysql_core_1.alias)(schema_1.productChannelPricing, "g_channel");
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
            isOutOfStock: schema_1.food.isOutOfStock,
            branchOverridePrice: schema_1.branchMenuItems.price,
            branchChannelPrice: branchChannelPricingAlias.price,
            globalChannelPrice: globalChannelPricingAlias.price,
            finalCalculatedPrice: (0, drizzle_orm_1.sql) `
                    COALESCE(
                        ${branchChannelPricingAlias.price},
                        ${globalChannelPricingAlias.price},
                        NULLIF(${schema_1.branchMenuItems.price}, 0.00),
                        ${schema_1.food.price}
                    )
                `,
            isAvailable: (0, drizzle_orm_1.sql) `
                    CASE 
                        WHEN ${branchChannelPricingAlias.status} IS NOT NULL THEN (CASE WHEN ${branchChannelPricingAlias.status} = 'active' THEN 1 ELSE 0 END)
                        WHEN ${globalChannelPricingAlias.status} IS NOT NULL THEN (CASE WHEN ${globalChannelPricingAlias.status} = 'active' THEN 1 ELSE 0 END)
                        WHEN ${schema_1.branchMenuItems.status} IS NOT NULL THEN (CASE WHEN ${schema_1.branchMenuItems.status} = 'active' THEN 1 ELSE 0 END)
                        ELSE 1
                    END
                `,
        })
            .from(schema_1.food)
            .leftJoin(schema_1.branchMenuItems, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, schema_1.food.id), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, singleBranchId)))
            .leftJoin(branchChannelPricingAlias, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(branchChannelPricingAlias.foodId, schema_1.food.id), (0, drizzle_orm_1.eq)(branchChannelPricingAlias.branchId, singleBranchId), (0, drizzle_orm_1.eq)(branchChannelPricingAlias.serviceModule, singleModule)))
            .leftJoin(globalChannelPricingAlias, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(globalChannelPricingAlias.foodId, schema_1.food.id), (0, drizzle_orm_1.isNull)(globalChannelPricingAlias.branchId), (0, drizzle_orm_1.eq)(globalChannelPricingAlias.serviceModule, singleModule)))
            .where((0, drizzle_orm_1.and)(...foodConditions));
        const foodIds = menuItems.map((item) => item.id);
        let variationsData = [];
        if (foodIds.length > 0) {
            const branchVarPricing = (0, mysql_core_1.alias)(schema_1.branchVariantPricing, "b_var_pricing");
            const branchVarChannel = (0, mysql_core_1.alias)(schema_1.variantChannelPricing, "b_var_channel");
            const globalVarChannel = (0, mysql_core_1.alias)(schema_1.variantChannelPricing, "g_var_channel");
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
                finalOptionPrice: (0, drizzle_orm_1.sql) `
                        COALESCE(
                            ${branchVarChannel.price},
                            ${globalVarChannel.price},
                            NULLIF(${branchVarPricing.price}, 0.00),
                            ${schema_1.variationOptions.additionalPrice}
                        )
                    `,
                isOptionAvailable: (0, drizzle_orm_1.sql) `
                        CASE 
                            WHEN ${branchVarChannel.status} IS NOT NULL THEN (CASE WHEN ${branchVarChannel.status} = 'active' THEN 1 ELSE 0 END)
                            WHEN ${globalVarChannel.status} IS NOT NULL THEN (CASE WHEN ${globalVarChannel.status} = 'active' THEN 1 ELSE 0 END)
                            WHEN ${branchVarPricing.status} IS NOT NULL THEN (CASE WHEN ${branchVarPricing.status} = 'active' THEN 1 ELSE 0 END)
                            ELSE 1
                        END
                    `,
            })
                .from(schema_1.foodVariations)
                .innerJoin(schema_1.variationOptions, (0, drizzle_orm_1.eq)(schema_1.variationOptions.variationId, schema_1.foodVariations.id))
                .leftJoin(branchVarPricing, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(branchVarPricing.variantId, schema_1.variationOptions.id), (0, drizzle_orm_1.eq)(branchVarPricing.branchId, singleBranchId)))
                .leftJoin(branchVarChannel, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(branchVarChannel.variantId, schema_1.variationOptions.id), (0, drizzle_orm_1.eq)(branchVarChannel.branchId, singleBranchId), (0, drizzle_orm_1.eq)(branchVarChannel.serviceModule, singleModule)))
                .leftJoin(globalVarChannel, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(globalVarChannel.variantId, schema_1.variationOptions.id), (0, drizzle_orm_1.isNull)(globalVarChannel.branchId), (0, drizzle_orm_1.eq)(globalVarChannel.serviceModule, singleModule)))
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
            varGroup.options.push({
                id: v.optionId,
                name: v.optionName,
                nameAr: v.optionNameAr,
                price: v.finalOptionPrice,
                isAvailable: Boolean(v.isOptionAvailable),
            });
        }
        const finalMenu = menuItems.map((item) => ({
            ...item,
            isOutOfStock: Boolean(item.isOutOfStock),
            isAvailable: Boolean(item.isAvailable),
            variations: variationsByFoodId[item.id] || [],
        }));
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
        isOutOfStock: schema_1.food.isOutOfStock,
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
    // Fetch branch overrides for all specified branches
    const branchOverrides = branchIds.length > 0
        ? await connection_1.db
            .select({
            foodId: schema_1.branchMenuItems.foodId,
            branchId: schema_1.branchMenuItems.branchId,
            price: schema_1.branchMenuItems.price,
            status: schema_1.branchMenuItems.status,
        })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.branchMenuItems.foodId, foodIds), (0, drizzle_orm_1.inArray)(schema_1.branchMenuItems.branchId, branchIds)))
        : [];
    // Fetch product channel pricing filtered by branchIds (or global) & serviceModules
    const productChannelConditions = [(0, drizzle_orm_1.inArray)(schema_1.productChannelPricing.foodId, foodIds)];
    if (branchIds.length > 0) {
        productChannelConditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema_1.productChannelPricing.branchId, branchIds), (0, drizzle_orm_1.isNull)(schema_1.productChannelPricing.branchId)));
    }
    if (serviceModules.length > 0) {
        productChannelConditions.push((0, drizzle_orm_1.inArray)(schema_1.productChannelPricing.serviceModule, serviceModules));
    }
    const channelPricingList = await connection_1.db
        .select({
        id: schema_1.productChannelPricing.id,
        foodId: schema_1.productChannelPricing.foodId,
        branchId: schema_1.productChannelPricing.branchId,
        serviceModule: schema_1.productChannelPricing.serviceModule,
        price: schema_1.productChannelPricing.price,
        status: schema_1.productChannelPricing.status,
    })
        .from(schema_1.productChannelPricing)
        .where((0, drizzle_orm_1.and)(...productChannelConditions));
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
        })
            .from(schema_1.variationOptions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variationOptions.status, true), (0, drizzle_orm_1.inArray)(schema_1.variationOptions.variationId, varIds)))
        : [];
    const optionIds = allOptions.map((o) => o.id);
    // Variant channel pricing
    const variantChannelConditions = optionIds.length > 0 ? [(0, drizzle_orm_1.inArray)(schema_1.variantChannelPricing.variantId, optionIds)] : [];
    if (branchIds.length > 0 && variantChannelConditions.length > 0) {
        variantChannelConditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema_1.variantChannelPricing.branchId, branchIds), (0, drizzle_orm_1.isNull)(schema_1.variantChannelPricing.branchId)));
    }
    if (serviceModules.length > 0 && variantChannelConditions.length > 0) {
        variantChannelConditions.push((0, drizzle_orm_1.inArray)(schema_1.variantChannelPricing.serviceModule, serviceModules));
    }
    const varChannelPricingList = optionIds.length > 0
        ? await connection_1.db
            .select({
            id: schema_1.variantChannelPricing.id,
            variantId: schema_1.variantChannelPricing.variantId,
            branchId: schema_1.variantChannelPricing.branchId,
            serviceModule: schema_1.variantChannelPricing.serviceModule,
            price: schema_1.variantChannelPricing.price,
            status: schema_1.variantChannelPricing.status,
        })
            .from(schema_1.variantChannelPricing)
            .where((0, drizzle_orm_1.and)(...variantChannelConditions))
        : [];
    // Assemble final menu
    const finalMenu = rawFoods.map((f) => {
        const itemBranchOverrides = branchOverrides.filter((b) => b.foodId === f.id);
        const itemChannels = channelPricingList.filter((c) => c.foodId === f.id);
        const itemVariations = allVariations
            .filter((v) => v.foodId === f.id)
            .map((v) => {
            const options = allOptions
                .filter((o) => o.variationId === v.id)
                .map((o) => {
                const optChannels = varChannelPricingList.filter((vc) => vc.variantId === o.id);
                return {
                    id: o.id,
                    name: o.optionName,
                    nameAr: o.optionNameAr,
                    baseAdditionalPrice: o.additionalPrice,
                    price: optChannels[0]?.price || o.additionalPrice,
                    channelPricing: optChannels,
                    isAvailable: true,
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
        return {
            ...f,
            isOutOfStock: Boolean(f.isOutOfStock),
            isAvailable: true,
            branchOverrides: itemBranchOverrides,
            channelPricing: itemChannels,
            finalCalculatedPrice: itemChannels[0]?.price || itemBranchOverrides[0]?.price || f.mainBasePrice,
            variations: itemVariations,
        };
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Dynamic menu fetched successfully",
        data: {
            restaurantId,
            branchIds,
            serviceModules,
            subcategoryId: subcategoryId || null,
            categoryId: categoryId || null,
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
            // branchId can be an array of branch IDs, "all" (all branches + global), single branch ID, null (global), or undefined
            const rawBranch = entry.branchId;
            let targetBranches;
            if (rawBranch === undefined || rawBranch === null || rawBranch === "" || rawBranch === "global") {
                targetBranches = [null];
            }
            else {
                const parsedBranches = parseArrayParam(rawBranch);
                if (parsedBranches.includes("all")) {
                    const allRestaurantBranches = await tx
                        .select({ id: schema_1.branches.id })
                        .from(schema_1.branches)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
                    const branchIds = allRestaurantBranches.map((b) => b.id);
                    targetBranches = [...branchIds, null];
                }
                else {
                    targetBranches = parsedBranches.length > 0 ? parsedBranches : [null];
                }
            }
            // serviceModule can be an array ("takeaway", "delivery"), single string, or "all"
            const rawModule = entry.serviceModule;
            let targetModules;
            const parsedModules = parseArrayParam(rawModule);
            if (!rawModule || rawModule === "all" || parsedModules.includes("all") || parsedModules.length === 0) {
                targetModules = ["takeaway", "dine_in", "delivery"];
            }
            else {
                targetModules = parsedModules;
            }
            if (targetModules.length === 0)
                throw new BadRequest_1.BadRequest("serviceModule is required (e.g. takeaway, dine_in, delivery, all)");
            const priceVal = String(entry.price);
            const statusVal = entry.status === "inactive" ? "inactive" : "active";
            for (const targetBranchId of targetBranches) {
                for (const module of targetModules) {
                    const whereClause = targetBranchId
                        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.branchId, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.serviceModule, module))
                        : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.foodId, foodId), (0, drizzle_orm_1.isNull)(schema_1.productChannelPricing.branchId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.serviceModule, module));
                    const [existing] = await tx
                        .select({ id: schema_1.productChannelPricing.id })
                        .from(schema_1.productChannelPricing)
                        .where(whereClause)
                        .limit(1);
                    if (existing) {
                        await tx
                            .update(schema_1.productChannelPricing)
                            .set({ price: priceVal, status: statusVal, updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.id, existing.id));
                    }
                    else {
                        await tx.insert(schema_1.productChannelPricing).values({
                            id: (0, uuid_1.v4)(),
                            foodId,
                            branchId: targetBranchId,
                            serviceModule: module,
                            price: priceVal,
                            status: statusVal,
                        });
                    }
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
            // branchId can be an array of branch IDs, "all" (all branches + global), single branch ID, null (global), or undefined
            const rawBranch = entry.branchId;
            let targetBranches;
            if (rawBranch === undefined || rawBranch === null || rawBranch === "" || rawBranch === "global") {
                targetBranches = [null];
            }
            else {
                const parsedBranches = parseArrayParam(rawBranch);
                if (parsedBranches.includes("all")) {
                    const allRestaurantBranches = await tx
                        .select({ id: schema_1.branches.id })
                        .from(schema_1.branches)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")));
                    const branchIds = allRestaurantBranches.map((b) => b.id);
                    targetBranches = [...branchIds, null];
                }
                else {
                    targetBranches = parsedBranches.length > 0 ? parsedBranches : [null];
                }
            }
            // serviceModule can be an array ("takeaway", "delivery"), single string, or "all"
            const rawModule = entry.serviceModule;
            let targetModules;
            const parsedModules = parseArrayParam(rawModule);
            if (!rawModule || rawModule === "all" || parsedModules.includes("all") || parsedModules.length === 0) {
                targetModules = ["takeaway", "dine_in", "delivery"];
            }
            else {
                targetModules = parsedModules;
            }
            if (targetModules.length === 0)
                throw new BadRequest_1.BadRequest("serviceModule is required (e.g. takeaway, dine_in, delivery, all)");
            const priceVal = String(entry.price);
            const statusVal = entry.status === "inactive" ? "inactive" : "active";
            for (const targetBranchId of targetBranches) {
                for (const module of targetModules) {
                    const whereClause = targetBranchId
                        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.variantId, variantId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.branchId, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.serviceModule, module))
                        : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.variantId, variantId), (0, drizzle_orm_1.isNull)(schema_1.variantChannelPricing.branchId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.serviceModule, module));
                    const [existing] = await tx
                        .select({ id: schema_1.variantChannelPricing.id })
                        .from(schema_1.variantChannelPricing)
                        .where(whereClause)
                        .limit(1);
                    if (existing) {
                        await tx
                            .update(schema_1.variantChannelPricing)
                            .set({ price: priceVal, status: statusVal, updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.id, existing.id));
                    }
                    else {
                        await tx.insert(schema_1.variantChannelPricing).values({
                            id: (0, uuid_1.v4)(),
                            variantId,
                            branchId: targetBranchId,
                            serviceModule: module,
                            price: priceVal,
                            status: statusVal,
                        });
                    }
                }
            }
        }
    });
    return (0, response_1.SuccessResponse)(res, { message: "Variant channel pricing saved successfully" });
};
exports.upsertVariantChannelPricing = upsertVariantChannelPricing;
