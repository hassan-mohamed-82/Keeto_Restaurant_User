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
// Priority: COALESCE(Branch_Module_Price, Global_Module_Price, Branch_Item_Price, Main_Base_Price)
// ============================================================================
const getMenuWithDynamicPricing = async (req, res) => {
    // 1. Extract IDs from req.query or fallback to JWT token (req.user)
    const branchId = (req.query.branchId || req.user?.branchId || "")?.trim() || null;
    let restaurantId = (req.query.restaurantId || req.user?.restaurantId || "")?.trim() || null;
    const serviceModuleStr = req.query.serviceModule?.trim();
    const serviceModule = serviceModuleStr;
    // 2. Validate & resolve restaurantId
    if (branchId) {
        const [branch] = await connection_1.db
            .select({
            id: schema_1.branches.id,
            restaurantId: schema_1.branches.restaurantId,
            name: schema_1.branches.name,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId))
            .limit(1);
        if (!branch)
            throw new NotFound_1.NotFound("Branch not found");
        restaurantId = branch.restaurantId;
    }
    else if (!restaurantId) {
        throw new BadRequest_1.BadRequest("Neither branchId nor restaurantId was provided in query or token");
    }
    const branchChannelPricing = (0, mysql_core_1.alias)(schema_1.productChannelPricing, "b_channel");
    const globalChannelPricing = (0, mysql_core_1.alias)(schema_1.productChannelPricing, "g_channel");
    // Dynamic SQL calculation using COALESCE hierarchy
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
        branchOverridePrice: schema_1.branchMenuItems.price,
        branchChannelPrice: branchChannelPricing.price,
        globalChannelPrice: globalChannelPricing.price,
        finalCalculatedPrice: (0, drizzle_orm_1.sql) `
                COALESCE(
                    ${branchChannelPricing.price},
                    ${globalChannelPricing.price},
                    NULLIF(${schema_1.branchMenuItems.price}, 0.00),
                    ${schema_1.food.price}
                )
            `,
        isAvailable: (0, drizzle_orm_1.sql) `
                CASE 
                    WHEN ${branchChannelPricing.status} IS NOT NULL THEN (CASE WHEN ${branchChannelPricing.status} = 'active' THEN 1 ELSE 0 END)
                    WHEN ${globalChannelPricing.status} IS NOT NULL THEN (CASE WHEN ${globalChannelPricing.status} = 'active' THEN 1 ELSE 0 END)
                    WHEN ${schema_1.branchMenuItems.status} IS NOT NULL THEN (CASE WHEN ${schema_1.branchMenuItems.status} = 'active' THEN 1 ELSE 0 END)
                    ELSE 1
                END
            `,
    })
        .from(schema_1.food)
        .leftJoin(schema_1.branchMenuItems, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, schema_1.food.id), branchId ? (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId) : (0, drizzle_orm_1.isNull)(schema_1.branchMenuItems.id)))
        .leftJoin(branchChannelPricing, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(branchChannelPricing.foodId, schema_1.food.id), branchId ? (0, drizzle_orm_1.eq)(branchChannelPricing.branchId, branchId) : (0, drizzle_orm_1.isNull)(branchChannelPricing.id), serviceModule ? (0, drizzle_orm_1.eq)(branchChannelPricing.serviceModule, serviceModule) : undefined))
        .leftJoin(globalChannelPricing, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(globalChannelPricing.foodId, schema_1.food.id), (0, drizzle_orm_1.isNull)(globalChannelPricing.branchId), serviceModule ? (0, drizzle_orm_1.eq)(globalChannelPricing.serviceModule, serviceModule) : undefined))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId), (0, drizzle_orm_1.eq)(schema_1.food.status, "active")));
    // Dynamic Variant Calculations
    const branchVarPricing = (0, mysql_core_1.alias)(schema_1.branchVariantPricing, "b_var_pricing");
    const branchVarChannel = (0, mysql_core_1.alias)(schema_1.variantChannelPricing, "b_var_channel");
    const globalVarChannel = (0, mysql_core_1.alias)(schema_1.variantChannelPricing, "g_var_channel");
    const foodIds = menuItems.map((item) => item.id);
    let variationsData = [];
    if (foodIds.length > 0) {
        const variations = await connection_1.db
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
            .leftJoin(branchVarPricing, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(branchVarPricing.variantId, schema_1.variationOptions.id), branchId ? (0, drizzle_orm_1.eq)(branchVarPricing.branchId, branchId) : (0, drizzle_orm_1.isNull)(branchVarPricing.id)))
            .leftJoin(branchVarChannel, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(branchVarChannel.variantId, schema_1.variationOptions.id), branchId ? (0, drizzle_orm_1.eq)(branchVarChannel.branchId, branchId) : (0, drizzle_orm_1.isNull)(branchVarChannel.id), serviceModule ? (0, drizzle_orm_1.eq)(branchVarChannel.serviceModule, serviceModule) : undefined))
            .leftJoin(globalVarChannel, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(globalVarChannel.variantId, schema_1.variationOptions.id), (0, drizzle_orm_1.isNull)(globalVarChannel.branchId), serviceModule ? (0, drizzle_orm_1.eq)(globalVarChannel.serviceModule, serviceModule) : undefined))
            .where((0, drizzle_orm_1.eq)(schema_1.foodVariations.status, true));
        variationsData = variations;
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
        isAvailable: Boolean(item.isAvailable),
        variations: variationsByFoodId[item.id] || [],
    }));
    return (0, response_1.SuccessResponse)(res, {
        message: "Dynamic menu fetched successfully",
        data: {
            restaurantId,
            branchId: branchId || null,
            serviceModule: serviceModule || "all",
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
// Body: { foodId, branchId?, serviceModule, price, isAvailable? }
// ============================================================================
const upsertProductChannelPricing = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    await connection_1.db.transaction(async (tx) => {
        for (const entry of entries) {
            const { foodId, branchId, serviceModule, price, status } = entry;
            if (!foodId || !serviceModule || price === undefined)
                throw new BadRequest_1.BadRequest("foodId, serviceModule, and price are required");
            const priceVal = String(price);
            const statusVal = status === "inactive" ? "inactive" : "active";
            const targetBranchId = branchId || null;
            const whereClause = targetBranchId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.branchId, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.serviceModule, serviceModule))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.productChannelPricing.foodId, foodId), (0, drizzle_orm_1.isNull)(schema_1.productChannelPricing.branchId), (0, drizzle_orm_1.eq)(schema_1.productChannelPricing.serviceModule, serviceModule));
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
                    serviceModule,
                    price: priceVal,
                    status: statusVal,
                });
            }
        }
    });
    return (0, response_1.SuccessResponse)(res, { message: "Product channel pricing saved successfully" });
};
exports.upsertProductChannelPricing = upsertProductChannelPricing;
// ============================================================================
// 6. CONTROLLER: Upsert Variant Channel Pricing
// POST /pricing/variant-channel
// Body: { variantId, branchId?, serviceModule, price, isAvailable? }
// ============================================================================
const upsertVariantChannelPricing = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    await connection_1.db.transaction(async (tx) => {
        for (const entry of entries) {
            const { variantId, branchId, serviceModule, price, status } = entry;
            if (!variantId || !serviceModule || price === undefined)
                throw new BadRequest_1.BadRequest("variantId, serviceModule, and price are required");
            const priceVal = String(price);
            const statusVal = status === "inactive" ? "inactive" : "active";
            const targetBranchId = branchId || null;
            const whereClause = targetBranchId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.variantId, variantId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.branchId, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.serviceModule, serviceModule))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.variantId, variantId), (0, drizzle_orm_1.isNull)(schema_1.variantChannelPricing.branchId), (0, drizzle_orm_1.eq)(schema_1.variantChannelPricing.serviceModule, serviceModule));
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
                    serviceModule,
                    price: priceVal,
                    status: statusVal,
                });
            }
        }
    });
    return (0, response_1.SuccessResponse)(res, { message: "Variant channel pricing saved successfully" });
};
exports.upsertVariantChannelPricing = upsertVariantChannelPricing;
