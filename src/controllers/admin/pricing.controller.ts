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
import { eq, and, isNull, sql, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import {
    UpsertFoodPricingInput,
    VariantPriceOverride,
    ServiceModule,
    BatchProductChannelPriceInput,
    BatchVariantChannelPriceInput,
} from "../../types/pricing";

function parseArrayParam(param: any): string[] {
    if (!param) return [];
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
// Supports single branch/module or collection of branchIds and serviceModules
// Priority: COALESCE(Branch_Module_Price, Global_Module_Price, Branch_Item_Price, Main_Base_Price)
// ============================================================================
export const getMenuWithDynamicPricing = async (req: Request, res: Response) => {
    // 1. Extract IDs from req.query (with fallback to req.body or JWT token)
    const branchParam =
        req.query.branchIds ||
        req.query.branchId ||
        req.body?.branchIds ||
        req.body?.branchId;
    const branchIds = parseArrayParam(branchParam);
    if (branchIds.length === 0 && req.user?.branchId) {
        branchIds.push(req.user.branchId);
    }

    let restaurantId =
        ((req.query.restaurantId as string) ||
            req.body?.restaurantId ||
            req.user?.restaurantId ||
            "")?.trim() || null;

    const moduleParam =
        req.query.serviceModules ||
        req.query.serviceModule ||
        req.body?.serviceModules ||
        req.body?.serviceModule;
    let serviceModules = parseArrayParam(moduleParam) as Array<"takeaway" | "dine_in" | "delivery">;
    if (serviceModules.includes("all" as any)) {
        serviceModules = ["takeaway", "dine_in", "delivery"];
    }

    const subcategoryId =
        ((req.query.subcategoryId ||
            req.query.subCategoryId ||
            req.query.subcategoryid ||
            req.body?.subcategoryId) as string)?.trim() || null;
    const categoryId =
        ((req.query.categoryId ||
            req.query.categoryid ||
            req.body?.categoryId) as string)?.trim() || null;

    // 2. Validate & resolve restaurantId
    if (branchIds.length > 0) {
        const foundBranches = await db
            .select({
                id: branches.id,
                restaurantId: branches.restaurantId,
                name: branches.name,
            })
            .from(branches)
            .where(inArray(branches.id, branchIds));

        if (foundBranches.length === 0) throw new NotFound("Branch(es) not found");
        restaurantId = foundBranches[0].restaurantId;
    } else if (!restaurantId) {
        throw new BadRequest("Neither branchId(s) nor restaurantId was provided in query, body, or token");
    }

    const isSingleBranch = branchIds.length === 1;
    const isSingleModule = serviceModules.length === 1;
    const singleBranchId = isSingleBranch ? branchIds[0] : null;
    const singleModule = isSingleModule ? serviceModules[0] : undefined;

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

    // 3A. FAST PATH: Single Branch & Single Service Module -> SQL COALESCE join
    if (isSingleBranch && isSingleModule) {
        const branchChannelPricingAlias = alias(productChannelPricing, "b_channel");
        const globalChannelPricingAlias = alias(productChannelPricing, "g_channel");

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
                branchChannelPrice: branchChannelPricingAlias.price,
                globalChannelPrice: globalChannelPricingAlias.price,
                finalCalculatedPrice: sql<string>`
                    COALESCE(
                        ${branchChannelPricingAlias.price},
                        ${globalChannelPricingAlias.price},
                        NULLIF(${branchMenuItems.price}, 0.00),
                        ${food.price}
                    )
                `,
                isAvailable: sql<number>`
                    CASE 
                        WHEN ${branchChannelPricingAlias.status} IS NOT NULL THEN (CASE WHEN ${branchChannelPricingAlias.status} = 'active' THEN 1 ELSE 0 END)
                        WHEN ${globalChannelPricingAlias.status} IS NOT NULL THEN (CASE WHEN ${globalChannelPricingAlias.status} = 'active' THEN 1 ELSE 0 END)
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
                    eq(branchMenuItems.branchId, singleBranchId!)
                )
            )
            .leftJoin(
                branchChannelPricingAlias,
                and(
                    eq(branchChannelPricingAlias.foodId, food.id),
                    eq(branchChannelPricingAlias.branchId, singleBranchId!),
                    eq(branchChannelPricingAlias.serviceModule, singleModule!)
                )
            )
            .leftJoin(
                globalChannelPricingAlias,
                and(
                    eq(globalChannelPricingAlias.foodId, food.id),
                    isNull(globalChannelPricingAlias.branchId),
                    eq(globalChannelPricingAlias.serviceModule, singleModule!)
                )
            )
            .where(and(...foodConditions));

        const foodIds = menuItems.map((item) => item.id);
        let variationsData: any[] = [];
        if (foodIds.length > 0) {
            const branchVarPricing = alias(branchVariantPricing, "b_var_pricing");
            const branchVarChannel = alias(variantChannelPricing, "b_var_channel");
            const globalVarChannel = alias(variantChannelPricing, "g_var_channel");

            variationsData = await db
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
                        eq(branchVarPricing.branchId, singleBranchId!)
                    )
                )
                .leftJoin(
                    branchVarChannel,
                    and(
                        eq(branchVarChannel.variantId, variationOptions.id),
                        eq(branchVarChannel.branchId, singleBranchId!),
                        eq(branchVarChannel.serviceModule, singleModule!)
                    )
                )
                .leftJoin(
                    globalVarChannel,
                    and(
                        eq(globalVarChannel.variantId, variationOptions.id),
                        isNull(globalVarChannel.branchId),
                        eq(globalVarChannel.serviceModule, singleModule!)
                    )
                )
                .where(and(eq(foodVariations.status, true), inArray(foodVariations.foodId, foodIds)));
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
    const rawFoods = await db
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
        })
        .from(food)
        .where(and(...foodConditions));

    if (rawFoods.length === 0) {
        return SuccessResponse(res, {
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
        ? await db
            .select({
                foodId: branchMenuItems.foodId,
                branchId: branchMenuItems.branchId,
                price: branchMenuItems.price,
                status: branchMenuItems.status,
            })
            .from(branchMenuItems)
            .where(
                and(
                    inArray(branchMenuItems.foodId, foodIds),
                    inArray(branchMenuItems.branchId, branchIds)
                )
            )
        : [];

    // Fetch product channel pricing filtered by branchIds (or global) & serviceModules
    const productChannelConditions = [inArray(productChannelPricing.foodId, foodIds)];
    if (branchIds.length > 0) {
        productChannelConditions.push(
            or(inArray(productChannelPricing.branchId, branchIds), isNull(productChannelPricing.branchId))!
        );
    }
    if (serviceModules.length > 0) {
        productChannelConditions.push(inArray(productChannelPricing.serviceModule, serviceModules));
    }

    const channelPricingList = await db
        .select({
            id: productChannelPricing.id,
            foodId: productChannelPricing.foodId,
            branchId: productChannelPricing.branchId,
            serviceModule: productChannelPricing.serviceModule,
            price: productChannelPricing.price,
            status: productChannelPricing.status,
        })
        .from(productChannelPricing)
        .where(and(...productChannelConditions));

    // Variations & Options
    const allVariations = await db
        .select({
            id: foodVariations.id,
            foodId: foodVariations.foodId,
            name: foodVariations.name,
            isRequired: foodVariations.isRequired,
            selectionType: foodVariations.selectionType,
        })
        .from(foodVariations)
        .where(and(eq(foodVariations.status, true), inArray(foodVariations.foodId, foodIds)));

    const varIds = allVariations.map((v) => v.id);

    const allOptions = varIds.length > 0
        ? await db
            .select({
                id: variationOptions.id,
                variationId: variationOptions.variationId,
                optionName: variationOptions.optionName,
                optionNameAr: variationOptions.optionNameAr,
                additionalPrice: variationOptions.additionalPrice,
            })
            .from(variationOptions)
            .where(and(eq(variationOptions.status, true), inArray(variationOptions.variationId, varIds)))
        : [];

    const optionIds = allOptions.map((o) => o.id);

    // Variant channel pricing
    const variantChannelConditions = optionIds.length > 0 ? [inArray(variantChannelPricing.variantId, optionIds)] : [];
    if (branchIds.length > 0 && variantChannelConditions.length > 0) {
        variantChannelConditions.push(
            or(inArray(variantChannelPricing.branchId, branchIds), isNull(variantChannelPricing.branchId))!
        );
    }
    if (serviceModules.length > 0 && variantChannelConditions.length > 0) {
        variantChannelConditions.push(inArray(variantChannelPricing.serviceModule, serviceModules));
    }

    const varChannelPricingList = optionIds.length > 0
        ? await db
            .select({
                id: variantChannelPricing.id,
                variantId: variantChannelPricing.variantId,
                branchId: variantChannelPricing.branchId,
                serviceModule: variantChannelPricing.serviceModule,
                price: variantChannelPricing.price,
                status: variantChannelPricing.status,
            })
            .from(variantChannelPricing)
            .where(and(...variantChannelConditions))
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

    return SuccessResponse(res, {
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
// Body: { foodId, branchId: string | string[] | null, serviceModule: string | string[], price, status } or array of objects
// ============================================================================
export const upsertProductChannelPricing = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const entries: BatchProductChannelPriceInput[] = Array.isArray(req.body) ? req.body : [req.body];

    await db.transaction(async (tx) => {
        for (const entry of entries) {
            const foodId = (entry.foodId || "")?.trim();
            if (!foodId) throw new BadRequest("foodId is required");

            if (entry.price === undefined || entry.price === null || entry.price === "")
                throw new BadRequest("price is required");

            // branchId can be an array of branch IDs, single branch ID, null (global), or undefined
            const rawBranch = entry.branchId;
            let targetBranches: Array<string | null>;
            if (rawBranch === undefined || rawBranch === null || rawBranch === "" || rawBranch === "global") {
                targetBranches = [null];
            } else {
                const parsed = parseArrayParam(rawBranch);
                targetBranches = parsed.length > 0 ? parsed : [null];
            }

            // serviceModule can be an array ("takeaway", "delivery"), single string, or "all"
            const rawModule = entry.serviceModule;
            let targetModules: ServiceModule[];
            if (!rawModule || rawModule === "all" || (Array.isArray(rawModule) && rawModule.includes("all" as any))) {
                targetModules = ["takeaway", "dine_in", "delivery"];
            } else {
                targetModules = parseArrayParam(rawModule) as ServiceModule[];
            }

            if (targetModules.length === 0)
                throw new BadRequest("serviceModule is required (e.g. takeaway, dine_in, delivery)");

            const priceVal = String(entry.price);
            const statusVal: "active" | "inactive" = entry.status === "inactive" ? "inactive" : "active";

            for (const targetBranchId of targetBranches) {
                for (const module of targetModules) {
                    const whereClause = targetBranchId
                        ? and(
                            eq(productChannelPricing.foodId, foodId),
                            eq(productChannelPricing.branchId, targetBranchId),
                            eq(productChannelPricing.serviceModule, module)
                        )
                        : and(
                            eq(productChannelPricing.foodId, foodId),
                            isNull(productChannelPricing.branchId),
                            eq(productChannelPricing.serviceModule, module)
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
                            serviceModule: module,
                            price: priceVal,
                            status: statusVal,
                        });
                    }
                }
            }
        }
    });

    return SuccessResponse(res, { message: "Product channel pricing saved successfully" });
};

// ============================================================================
// 6. CONTROLLER: Upsert Variant Channel Pricing
// POST /pricing/variant-channel
// Body: { variantId, branchId: string | string[] | null, serviceModule: string | string[], price, status } or array of objects
// ============================================================================
export const upsertVariantChannelPricing = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const entries: BatchVariantChannelPriceInput[] = Array.isArray(req.body) ? req.body : [req.body];

    await db.transaction(async (tx) => {
        for (const entry of entries) {
            const variantId = (entry.variantId || "")?.trim();
            if (!variantId) throw new BadRequest("variantId is required");

            if (entry.price === undefined || entry.price === null || entry.price === "")
                throw new BadRequest("price is required");

            // branchId can be an array of branch IDs, single branch ID, null (global), or undefined
            const rawBranch = entry.branchId;
            let targetBranches: Array<string | null>;
            if (rawBranch === undefined || rawBranch === null || rawBranch === "" || rawBranch === "global") {
                targetBranches = [null];
            } else {
                const parsed = parseArrayParam(rawBranch);
                targetBranches = parsed.length > 0 ? parsed : [null];
            }

            // serviceModule can be an array ("takeaway", "delivery"), single string, or "all"
            const rawModule = entry.serviceModule;
            let targetModules: ServiceModule[];
            if (!rawModule || rawModule === "all" || (Array.isArray(rawModule) && rawModule.includes("all" as any))) {
                targetModules = ["takeaway", "dine_in", "delivery"];
            } else {
                targetModules = parseArrayParam(rawModule) as ServiceModule[];
            }

            if (targetModules.length === 0)
                throw new BadRequest("serviceModule is required (e.g. takeaway, dine_in, delivery)");

            const priceVal = String(entry.price);
            const statusVal: "active" | "inactive" = entry.status === "inactive" ? "inactive" : "active";

            for (const targetBranchId of targetBranches) {
                for (const module of targetModules) {
                    const whereClause = targetBranchId
                        ? and(
                            eq(variantChannelPricing.variantId, variantId),
                            eq(variantChannelPricing.branchId, targetBranchId),
                            eq(variantChannelPricing.serviceModule, module)
                        )
                        : and(
                            eq(variantChannelPricing.variantId, variantId),
                            isNull(variantChannelPricing.branchId),
                            eq(variantChannelPricing.serviceModule, module)
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
                            serviceModule: module,
                            price: priceVal,
                            status: statusVal,
                        });
                    }
                }
            }
        }
    });

    return SuccessResponse(res, { message: "Variant channel pricing saved successfully" });
};


