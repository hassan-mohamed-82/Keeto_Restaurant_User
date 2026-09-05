import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    food,
    branches,
    branchMenuItems,
    branchVariantPricing,
    productChannelPricing,
    variantChannelPricing,
    variationOptions,
    foodVariations,
} from "../../models/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import {
    UpsertFoodPricingInput,
    VariantPriceOverride,
    ServiceModule,
} from "../../types/pricing";

// ============================================================================
// 1. HELPER: Sync Variant Branch Pricing & Channel Pricing
// ============================================================================
export async function syncVariantPricing(
    tx: any,
    restaurantId: string,
    variants: VariantPriceOverride[]
) {
    if (!variants || variants.length === 0) return;

    // Fetch all active branches for the restaurant
    const allBranches = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.restaurantId, restaurantId), eq(branches.status, "active")));

    const allBranchIds: string[] = allBranches.map((b: any) => b.id);

    for (const vOverride of variants) {
        const variantId = vOverride.variantId;
        if (!variantId) continue;

        // Only save branchVariantPricing if branches array is provided and non-empty
        if (vOverride.branches && vOverride.branches.length > 0) {
            const branchOverrideMap = new Map<string, { price: string; status: "active" | "inactive" }>();
            for (const b of vOverride.branches) {
                if (b.branchId) {
                    const rawPrice = b.price;
                    const priceVal = (rawPrice !== undefined && rawPrice !== null && rawPrice !== "")
                        ? String(rawPrice)
                        : "0.00";
                    const statusVal: "active" | "inactive" = b.status === "inactive" ? "inactive" : "active";
                    branchOverrideMap.set(b.branchId, { price: priceVal, status: statusVal });
                }
            }

            // Apply overrides only for provided branches
            for (const bId of allBranchIds) {
                if (!branchOverrideMap.has(bId)) continue;
                const override = branchOverrideMap.get(bId)!;

                const [existing] = await tx
                    .select({ id: branchVariantPricing.id })
                    .from(branchVariantPricing)
                    .where(
                        and(
                            eq(branchVariantPricing.branchId, bId),
                            eq(branchVariantPricing.variantId, variantId)
                        )
                    )
                    .limit(1);

                if (existing) {
                    await tx
                        .update(branchVariantPricing)
                        .set({
                            price: override.price,
                            status: override.status,
                            updatedAt: new Date(),
                        })
                        .where(eq(branchVariantPricing.id, existing.id));
                } else {
                    await tx.insert(branchVariantPricing).values({
                        id: uuidv4(),
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
                const statusVal: "active" | "inactive" = chOverride.status === "inactive" ? "inactive" : "active";

                const whereClause = targetBranchId
                    ? and(
                        eq(variantChannelPricing.variantId, variantId),
                        eq(variantChannelPricing.branchId, targetBranchId),
                        eq(variantChannelPricing.serviceModule, serviceModule)
                    )
                    : and(
                        eq(variantChannelPricing.variantId, variantId),
                        isNull(variantChannelPricing.branchId),
                        eq(variantChannelPricing.serviceModule, serviceModule)
                    );

                const [existingCh] = await tx
                    .select({ id: variantChannelPricing.id })
                    .from(variantChannelPricing)
                    .where(whereClause)
                    .limit(1);

                if (existingCh) {
                    await tx
                        .update(variantChannelPricing)
                        .set({
                            price: priceVal,
                            status: statusVal,
                            updatedAt: new Date(),
                        })
                        .where(eq(variantChannelPricing.id, existingCh.id));
                } else {
                    await tx.insert(variantChannelPricing).values({
                        id: uuidv4(),
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
export const getActiveBranchWithServiceModule = async (req: Request, res: Response) => {
    const restaurantId = (req.user?.restaurantId as string)?.trim() || null;

    if (!restaurantId) throw new BadRequest("No restaurant ID available in token");

    // Fetch only active branches
    const activeBranches = await db
        .select({
            id: branches.id,
            name: branches.name,
        })
        .from(branches)
        .where(
            and(
                eq(branches.restaurantId, restaurantId),
                eq(branches.status, "active")
            )
        );

    const serviceModules = [
        { id: "dine_in", name: "Dine In" },
        { id: "takeaway", name: "Take Away" },
        { id: "delivery", name: "Delivery" }
    ]

    return SuccessResponse(res, {
        message: "Active branches fetched successfully",
        data: {
            activeBranches,
            serviceModules
        },
    });
};

// ============================================================================
// 2. CONTROLLER: Upsert Food With Branch & Channel Pricing
// ============================================================================
export const upsertFoodWithPricing = async (req: Request, res: Response) => {
    const input: UpsertFoodPricingInput = req.body;

    if (!input.restaurantId) throw new BadRequest("restaurantId is required");
    if (!input.name) throw new BadRequest("name is required");
    if (!input.categoryId) throw new BadRequest("categoryId is required");
    if (input.mainPrice === undefined || input.mainPrice === null) throw new BadRequest("mainPrice is required");

    const mainPriceStr = String(input.mainPrice);

    const result = await db.transaction(async (tx) => {
        let foodId = input.id;

        // 1. Create or Update Base Food Record (Sets standard food.price)
        if (foodId) {
            const [existingFood] = await tx
                .select({ id: food.id })
                .from(food)
                .where(eq(food.id, foodId))
                .limit(1);

            if (!existingFood) throw new NotFound(`Food with ID ${foodId} not found`);

            await tx
                .update(food)
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
                .where(eq(food.id, foodId));
        } else {
            foodId = uuidv4();
            await tx.insert(food).values({
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
            .select({ id: branches.id })
            .from(branches)
            .where(
                and(
                    eq(branches.restaurantId, input.restaurantId),
                    eq(branches.status, "active")
                )
            );

        const allBranchIds: string[] = allBranches.map((b: any) => b.id);

        // 3. Process Branch Menu Overrides (branch_menu_items)
        // Only save to branchMenuItems if branches array is provided and non-empty
        if (input.branches && input.branches.length > 0) {
            const branchOverrideMap = new Map<string, { price: string; status: "active" | "inactive" }>();
            for (const b of input.branches) {
                if (b.branchId) {
                    const rawPrice = b.price;
                    const priceVal = (rawPrice !== undefined && rawPrice !== null && rawPrice !== "")
                        ? String(rawPrice)
                        : "0.00";
                    const statusVal: "active" | "inactive" = b.status === "inactive" ? "inactive" : "active";
                    branchOverrideMap.set(b.branchId, { price: priceVal, status: statusVal });
                }
            }

            // Upsert into branch_menu_items only for provided branches
            for (const bId of allBranchIds) {
                if (!branchOverrideMap.has(bId)) continue; // skip branches not in the input
                const override = branchOverrideMap.get(bId)!;

                const [existingItem] = await tx
                    .select({ id: branchMenuItems.id })
                    .from(branchMenuItems)
                    .where(
                        and(
                            eq(branchMenuItems.branchId, bId),
                            eq(branchMenuItems.foodId, foodId)
                        )
                    )
                    .limit(1);

                if (existingItem) {
                    await tx
                        .update(branchMenuItems)
                        .set({
                            price: override.price,
                            status: override.status,
                            updatedAt: new Date(),
                        })
                        .where(eq(branchMenuItems.id, existingItem.id));
                } else {
                    await tx.insert(branchMenuItems).values({
                        id: uuidv4(),
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
                const statusVal: "active" | "inactive" = chOverride.status === "inactive" ? "inactive" : "active";

                const whereClause = targetBranchId
                    ? and(
                        eq(productChannelPricing.foodId, foodId),
                        eq(productChannelPricing.branchId, targetBranchId),
                        eq(productChannelPricing.serviceModule, serviceModule)
                    )
                    : and(
                        eq(productChannelPricing.foodId, foodId),
                        isNull(productChannelPricing.branchId),
                        eq(productChannelPricing.serviceModule, serviceModule)
                    );

                const [existingCh] = await tx
                    .select({ id: productChannelPricing.id })
                    .from(productChannelPricing)
                    .where(whereClause)
                    .limit(1);

                if (existingCh) {
                    await tx
                        .update(productChannelPricing)
                        .set({
                            price: priceVal,
                            status: statusVal,
                            updatedAt: new Date(),
                        })
                        .where(eq(productChannelPricing.id, existingCh.id));
                } else {
                    await tx.insert(productChannelPricing).values({
                        id: uuidv4(),
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

    return SuccessResponse(res, {
        message: "Food and pricing saved successfully",
        data: result,
    });
};

// ============================================================================
// 3. CONTROLLER: Get Dynamic Menu with Pricing Hierarchy (User App & Admin)
// Priority: COALESCE(Branch_Module_Price, Global_Module_Price, Branch_Item_Price, Main_Base_Price)
// ============================================================================
export const getMenuWithDynamicPricing = async (req: Request, res: Response) => {
    // 1. Extract IDs from req.query or fallback to JWT token (req.user)
    const branchId =
        ((req.query.branchId as string) || req.user?.branchId || "")?.trim() || null;
    let restaurantId =
        ((req.query.restaurantId as string) || req.user?.restaurantId || "")?.trim() || null;

    const serviceModuleStr = (req.query.serviceModule as string)?.trim();
    const serviceModule = serviceModuleStr as "takeaway" | "dine_in" | "delivery" | undefined;

    const subcategoryId =
        ((req.query.subcategoryId || req.query.subCategoryId || req.query.subcategoryid) as string)?.trim() || null;
    const categoryId =
        ((req.query.categoryId || req.query.categoryid) as string)?.trim() || null;

    // 2. Validate & resolve restaurantId
    if (branchId) {
        const [branch] = await db
            .select({
                id: branches.id,
                restaurantId: branches.restaurantId,
                name: branches.name,
            })
            .from(branches)
            .where(eq(branches.id, branchId))
            .limit(1);

        if (!branch) throw new NotFound("Branch not found");
        restaurantId = branch.restaurantId;
    } else if (!restaurantId) {
        throw new BadRequest("Neither branchId nor restaurantId was provided in query or token");
    }

    const branchChannelPricing = alias(productChannelPricing, "b_channel");
    const globalChannelPricing = alias(productChannelPricing, "g_channel");

    const foodConditions = [
        eq(food.restaurantid, restaurantId),
        eq(food.status, "active"),
    ];

    if (subcategoryId) {
        foodConditions.push(eq(food.subcategoryid, subcategoryId));
    }

    if (categoryId) {
        foodConditions.push(eq(food.categoryid, categoryId));
    }

    // Dynamic SQL calculation using COALESCE hierarchy
    const menuItems = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            description: food.description,
            image: food.image,
            categoryId: food.categoryid,
            subcategoryId: food.subcategoryid,
            mainBasePrice: food.price,
            isOutOfStock: food.isOutOfStock,
            branchOverridePrice: branchMenuItems.price,
            branchChannelPrice: branchChannelPricing.price,
            globalChannelPrice: globalChannelPricing.price,
            finalCalculatedPrice: sql<string>`
                COALESCE(
                    ${branchChannelPricing.price},
                    ${globalChannelPricing.price},
                    NULLIF(${branchMenuItems.price}, 0.00),
                    ${food.price}
                )
            `,
            isAvailable: sql<number>`
                CASE 
                    WHEN ${branchChannelPricing.status} IS NOT NULL THEN (CASE WHEN ${branchChannelPricing.status} = 'active' THEN 1 ELSE 0 END)
                    WHEN ${globalChannelPricing.status} IS NOT NULL THEN (CASE WHEN ${globalChannelPricing.status} = 'active' THEN 1 ELSE 0 END)
                    WHEN ${branchMenuItems.status} IS NOT NULL THEN (CASE WHEN ${branchMenuItems.status} = 'active' THEN 1 ELSE 0 END)
                    ELSE 1
                END
            `,
        })
        .from(food)
        .leftJoin(
            branchMenuItems,
            and(
                eq(branchMenuItems.foodId, food.id),
                branchId ? eq(branchMenuItems.branchId, branchId) : isNull(branchMenuItems.id)
            )
        )
        .leftJoin(
            branchChannelPricing,
            and(
                eq(branchChannelPricing.foodId, food.id),
                branchId ? eq(branchChannelPricing.branchId, branchId) : isNull(branchChannelPricing.id),
                serviceModule ? eq(branchChannelPricing.serviceModule, serviceModule) : undefined
            )
        )
        .leftJoin(
            globalChannelPricing,
            and(
                eq(globalChannelPricing.foodId, food.id),
                isNull(globalChannelPricing.branchId),
                serviceModule ? eq(globalChannelPricing.serviceModule, serviceModule) : undefined
            )
        )
        .where(and(...foodConditions));

    // Dynamic Variant Calculations
    const branchVarPricing = alias(branchVariantPricing, "b_var_pricing");
    const branchVarChannel = alias(variantChannelPricing, "b_var_channel");
    const globalVarChannel = alias(variantChannelPricing, "g_var_channel");

    const foodIds = menuItems.map((item) => item.id);

    let variationsData: any[] = [];
    if (foodIds.length > 0) {
        const variations = await db
            .select({
                variationId: foodVariations.id,
                foodId: foodVariations.foodId,
                variationName: foodVariations.name,
                isRequired: foodVariations.isRequired,
                selectionType: foodVariations.selectionType,
                optionId: variationOptions.id,
                optionName: variationOptions.optionName,
                optionNameAr: variationOptions.optionNameAr,
                baseAdditionalPrice: variationOptions.additionalPrice,
                finalOptionPrice: sql<string>`
                    COALESCE(
                        ${branchVarChannel.price},
                        ${globalVarChannel.price},
                        NULLIF(${branchVarPricing.price}, 0.00),
                        ${variationOptions.additionalPrice}
                    )
                `,
                isOptionAvailable: sql<number>`
                    CASE 
                        WHEN ${branchVarChannel.status} IS NOT NULL THEN (CASE WHEN ${branchVarChannel.status} = 'active' THEN 1 ELSE 0 END)
                        WHEN ${globalVarChannel.status} IS NOT NULL THEN (CASE WHEN ${globalVarChannel.status} = 'active' THEN 1 ELSE 0 END)
                        WHEN ${branchVarPricing.status} IS NOT NULL THEN (CASE WHEN ${branchVarPricing.status} = 'active' THEN 1 ELSE 0 END)
                        ELSE 1
                    END
                `,
            })
            .from(foodVariations)
            .innerJoin(
                variationOptions,
                eq(variationOptions.variationId, foodVariations.id)
            )
            .leftJoin(
                branchVarPricing,
                and(
                    eq(branchVarPricing.variantId, variationOptions.id),
                    branchId ? eq(branchVarPricing.branchId, branchId) : isNull(branchVarPricing.id)
                )
            )
            .leftJoin(
                branchVarChannel,
                and(
                    eq(branchVarChannel.variantId, variationOptions.id),
                    branchId ? eq(branchVarChannel.branchId, branchId) : isNull(branchVarChannel.id),
                    serviceModule ? eq(branchVarChannel.serviceModule, serviceModule) : undefined
                )
            )
            .leftJoin(
                globalVarChannel,
                and(
                    eq(globalVarChannel.variantId, variationOptions.id),
                    isNull(globalVarChannel.branchId),
                    serviceModule ? eq(globalVarChannel.serviceModule, serviceModule) : undefined
                )
            )
            .where(eq(foodVariations.status, true));

        variationsData = variations;
    }

    const variationsByFoodId: Record<string, any[]> = {};
    for (const v of variationsData) {
        if (!variationsByFoodId[v.foodId]) {
            variationsByFoodId[v.foodId] = [];
        }
        let varGroup = variationsByFoodId[v.foodId].find(
            (g: any) => g.id === v.variationId
        );
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

    return SuccessResponse(res, {
        message: "Dynamic menu fetched successfully",
        data: {
            restaurantId,
            branchId: branchId || null,
            subcategoryId: subcategoryId || null,
            categoryId: categoryId || null,
            serviceModule: serviceModule || "all",
            menu: finalMenu,
        },
    });
};
// ============================================================================
// 4. CONTROLLER: Get Food List for Pricing UI (food + variations + options)
// GET /pricing/food-for-pricing
// ============================================================================
export const getFoodForPricing = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const rawFoods = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr,
            price: food.price,
            status: food.status,
        })
        .from(food)
        .where(eq(food.restaurantid, restaurantId));

    if (rawFoods.length === 0) {
        return SuccessResponse(res, { message: "No foods found", data: [] });
    }

    const foodIds = rawFoods.map((f) => f.id);

    const allVariations = await db
        .select({
            id: foodVariations.id,
            foodId: foodVariations.foodId,
            name: foodVariations.name,
            nameAr: foodVariations.nameAr,
            isRequired: foodVariations.isRequired,
            selectionType: foodVariations.selectionType,
        })
        .from(foodVariations)
        .where(eq(foodVariations.status, true));

    const varIds = allVariations.map((v) => v.id);
    const allOptions =
        varIds.length > 0
            ? await db
                .select({
                    id: variationOptions.id,
                    variationId: variationOptions.variationId,
                    optionName: variationOptions.optionName,
                    optionNameAr: variationOptions.optionNameAr,
                    additionalPrice: variationOptions.additionalPrice,
                })
                .from(variationOptions)
                .where(eq(variationOptions.status, true))
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

    return SuccessResponse(res, { message: "Food list for pricing fetched", data: result });
};

// ============================================================================
// 5. CONTROLLER: Upsert Product Channel Pricing
// POST /pricing/product-channel
// Body: { foodId, branchId?, serviceModule, price, status }
// ============================================================================
export const upsertProductChannelPricing = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const entries: Array<{
        foodId: string;
        branchId?: string | null;
        serviceModule: "takeaway" | "dine_in" | "delivery";
        price: string | number;
        status?: "active" | "inactive";
    }> = Array.isArray(req.body) ? req.body : [req.body];

    await db.transaction(async (tx) => {
        for (const entry of entries) {
            const { foodId, branchId, serviceModule, price, status } = entry;
            if (!foodId || !serviceModule || price === undefined)
                throw new BadRequest("foodId, serviceModule, and price are required");

            const priceVal = String(price);
            const statusVal: "active" | "inactive" = status === "inactive" ? "inactive" : "active";
            const targetBranchId = branchId || null;

            const whereClause = targetBranchId
                ? and(
                    eq(productChannelPricing.foodId, foodId),
                    eq(productChannelPricing.branchId, targetBranchId),
                    eq(productChannelPricing.serviceModule, serviceModule)
                )
                : and(
                    eq(productChannelPricing.foodId, foodId),
                    isNull(productChannelPricing.branchId),
                    eq(productChannelPricing.serviceModule, serviceModule)
                );

            const [existing] = await tx
                .select({ id: productChannelPricing.id })
                .from(productChannelPricing)
                .where(whereClause)
                .limit(1);

            if (existing) {
                await tx
                    .update(productChannelPricing)
                    .set({ price: priceVal, status: statusVal, updatedAt: new Date() })
                    .where(eq(productChannelPricing.id, existing.id));
            } else {
                await tx.insert(productChannelPricing).values({
                    id: uuidv4(),
                    foodId,
                    branchId: targetBranchId,
                    serviceModule,
                    price: priceVal,
                    status: statusVal,
                });
            }
        }
    });

    return SuccessResponse(res, { message: "Product channel pricing saved successfully" });
};

// ============================================================================
// 6. CONTROLLER: Upsert Variant Channel Pricing
// POST /pricing/variant-channel
// Body: { variantId, branchId?, serviceModule, price, status }
// ============================================================================
export const upsertVariantChannelPricing = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const entries: Array<{
        variantId: string;
        branchId?: string | null;
        serviceModule: "takeaway" | "dine_in" | "delivery";
        price: string | number;
        status?: "active" | "inactive";
    }> = Array.isArray(req.body) ? req.body : [req.body];

    await db.transaction(async (tx) => {
        for (const entry of entries) {
            const { variantId, branchId, serviceModule, price, status } = entry;
            if (!variantId || !serviceModule || price === undefined)
                throw new BadRequest("variantId, serviceModule, and price are required");

            const priceVal = String(price);
            const statusVal: "active" | "inactive" = status === "inactive" ? "inactive" : "active";
            const targetBranchId = branchId || null;

            const whereClause = targetBranchId
                ? and(
                    eq(variantChannelPricing.variantId, variantId),
                    eq(variantChannelPricing.branchId, targetBranchId),
                    eq(variantChannelPricing.serviceModule, serviceModule)
                )
                : and(
                    eq(variantChannelPricing.variantId, variantId),
                    isNull(variantChannelPricing.branchId),
                    eq(variantChannelPricing.serviceModule, serviceModule)
                );

            const [existing] = await tx
                .select({ id: variantChannelPricing.id })
                .from(variantChannelPricing)
                .where(whereClause)
                .limit(1);

            if (existing) {
                await tx
                    .update(variantChannelPricing)
                    .set({ price: priceVal, status: statusVal, updatedAt: new Date() })
                    .where(eq(variantChannelPricing.id, existing.id));
            } else {
                await tx.insert(variantChannelPricing).values({
                    id: uuidv4(),
                    variantId,
                    branchId: targetBranchId,
                    serviceModule,
                    price: priceVal,
                    status: statusVal,
                });
            }
        }
    });

    return SuccessResponse(res, { message: "Variant channel pricing saved successfully" });
};
