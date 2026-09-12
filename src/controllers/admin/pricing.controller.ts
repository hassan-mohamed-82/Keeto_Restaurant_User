import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    food,
    branches,
    branchMenuItems,
    foodPricingOverrides,
    variantPricingOverrides,
    variationOptions,
    foodVariations,
    subcategories,
    branchSubcategories,
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
import {
    pickBestOverride,
    upsertFoodPricingOverride,
    upsertVariantPricingOverride,
} from "../../helpers/pricing.overrides";

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

            for (const bId of allBranchIds) {
                if (!branchOverrideMap.has(bId)) continue;
                const override = branchOverrideMap.get(bId)!;
                await upsertVariantPricingOverride(tx, {
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
                await upsertVariantPricingOverride(tx, {
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

            for (const bId of allBranchIds) {
                if (!branchOverrideMap.has(bId)) continue;
                const override = branchOverrideMap.get(bId)!;

                await upsertFoodPricingOverride(tx, {
                    foodId,
                    branchId: bId,
                    serviceModule: null,
                    price: override.price,
                    status: override.status,
                });

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
                            status: override.status,
                            updatedAt: new Date(),
                        })
                        .where(eq(branchMenuItems.id, existingItem.id));
                } else {
                    await tx.insert(branchMenuItems).values({
                        id: uuidv4(),
                        branchId: bId,
                        foodId,
                        status: override.status,
                    });
                }
            }
        }

        if (input.channels && input.channels.length > 0) {
            for (const chOverride of input.channels) {
                await upsertFoodPricingOverride(tx, {
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
    let restaurantId =
        ((req.query.restaurantId as string) ||
            req.body?.restaurantId ||
            req.user?.restaurantId ||
            "")?.trim() || null;

    const branchParam =
        req.query.branchIds ||
        req.query.branchId ||
        req.body?.branchIds ||
        req.body?.branchId;
    const rawBranchIds = parseArrayParam(branchParam);
    if (rawBranchIds.length === 0 && req.user?.branchId) {
        rawBranchIds.push(req.user.branchId);
    }

    let branchIds: string[] = [];
    if (rawBranchIds.includes("all")) {
        if (!restaurantId && req.user?.id) {
            restaurantId = req.user.id;
        }
        if (restaurantId) {
            const allRestBranches = await db
                .select({ id: branches.id })
                .from(branches)
                .where(and(eq(branches.restaurantId, restaurantId), eq(branches.status, "active")));
            branchIds = allRestBranches.map((b) => b.id);
        }
    } else if (rawBranchIds.length > 0) {
        const foundBranches = await db
            .select({
                id: branches.id,
                restaurantId: branches.restaurantId,
                name: branches.name,
            })
            .from(branches)
            .where(inArray(branches.id, rawBranchIds));

        if (foundBranches.length === 0) throw new NotFound("Branch(es) not found");
        restaurantId = foundBranches[0].restaurantId;
        branchIds = foundBranches.map((b) => b.id);
    }

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
        const branchModuleAlias = alias(foodPricingOverrides, "fpo_bm");
        const branchOnlyAlias = alias(foodPricingOverrides, "fpo_b");
        const moduleOnlyAlias = alias(foodPricingOverrides, "fpo_m");

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
                points:food.points,
                branchOverridePrice: branchOnlyAlias.price,
                branchChannelPrice: branchModuleAlias.price,
                globalChannelPrice: moduleOnlyAlias.price,
                finalCalculatedPrice: sql<string>`
                    COALESCE(
                        ${branchModuleAlias.price},
                        ${branchOnlyAlias.price},
                        ${moduleOnlyAlias.price},
                        ${food.price}
                    )
                `,
                isAvailable: sql<number>`
                    CASE 
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
                branchModuleAlias,
                and(
                    eq(branchModuleAlias.foodId, food.id),
                    eq(branchModuleAlias.branchId, singleBranchId!),
                    eq(branchModuleAlias.serviceModule, singleModule!),
                    eq(branchModuleAlias.status, "active")
                )
            )
            .leftJoin(
                branchOnlyAlias,
                and(
                    eq(branchOnlyAlias.foodId, food.id),
                    eq(branchOnlyAlias.branchId, singleBranchId!),
                    isNull(branchOnlyAlias.serviceModule),
                    eq(branchOnlyAlias.status, "active")
                )
            )
            .leftJoin(
                moduleOnlyAlias,
                and(
                    eq(moduleOnlyAlias.foodId, food.id),
                    isNull(moduleOnlyAlias.branchId),
                    eq(moduleOnlyAlias.serviceModule, singleModule!),
                    eq(moduleOnlyAlias.status, "active")
                )
            )
            .where(and(...foodConditions));

        const foodIds = menuItems.map((item) => item.id);
        let variationsData: any[] = [];
        if (foodIds.length > 0) {
            const branchModuleVar = alias(variantPricingOverrides, "vpo_bm");
            const branchOnlyVar = alias(variantPricingOverrides, "vpo_b");
            const moduleOnlyVar = alias(variantPricingOverrides, "vpo_m");

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
                            ${branchModuleVar.price},
                            ${branchOnlyVar.price},
                            ${moduleOnlyVar.price},
                            ${variationOptions.additionalPrice}
                        )
                    `,
                    isOptionAvailable: sql<number>`
                        CASE 
                            WHEN ${variationOptions.status} = 0 THEN 0
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
                    branchModuleVar,
                    and(
                        eq(branchModuleVar.variantId, variationOptions.id),
                        eq(branchModuleVar.branchId, singleBranchId!),
                        eq(branchModuleVar.serviceModule, singleModule!),
                        eq(branchModuleVar.status, "active")
                    )
                )
                .leftJoin(
                    branchOnlyVar,
                    and(
                        eq(branchOnlyVar.variantId, variationOptions.id),
                        eq(branchOnlyVar.branchId, singleBranchId!),
                        isNull(branchOnlyVar.serviceModule),
                        eq(branchOnlyVar.status, "active")
                    )
                )
                .leftJoin(
                    moduleOnlyVar,
                    and(
                        eq(moduleOnlyVar.variantId, variationOptions.id),
                        isNull(moduleOnlyVar.branchId),
                        eq(moduleOnlyVar.serviceModule, singleModule!),
                        eq(moduleOnlyVar.status, "active")
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

        // ── Subcategory rollup ────────────────────────────────────────────────
        // Compute whether all products in each subcategory are inactive / OOS,
        // AND whether the subcategory itself is closed at branch level.
        const uniqueSubcategoryIds = [
            ...new Set(
                finalMenu.map((item) => item.subcategoryId).filter(Boolean) as string[]
            ),
        ];

        const subcategoryResult: any[] = [];
        if (uniqueSubcategoryIds.length > 0) {
            // All foods (active + inactive) for these subcategories
            const allFoodsForRollup = await db
                .select({
                    subcategoryId: food.subcategoryid,
                    status: food.status,
                    isOutOfStock: food.isOutOfStock,
                })
                .from(food)
                .where(
                    and(
                        eq(food.restaurantid, restaurantId!),
                        inArray(food.subcategoryid, uniqueSubcategoryIds)
                    )
                );

            // Rollup per subcategoryId
            const rollupMap: Record<string, { allInactive: boolean; allOutOfStock: boolean; hasProducts: boolean }> = {};
            for (const row of allFoodsForRollup) {
                const sid = row.subcategoryId!;
                if (!rollupMap[sid]) {
                    rollupMap[sid] = { allInactive: true, allOutOfStock: true, hasProducts: false };
                }
                rollupMap[sid].hasProducts = true;
                if (row.status !== "inactive") rollupMap[sid].allInactive = false;
                if (!row.isOutOfStock) rollupMap[sid].allOutOfStock = false;
            }

            // Fetch branch-level status + isOutOfStock for each subcategory in this branch
            const branchSubcategoryStatusMap: Record<string, string | null> = {};
            const branchSubcategoryOosMap: Record<string, boolean> = {};
            if (singleBranchId) {
                const branchSubcatRows = await db
                    .select({
                        subcategoryId: branchSubcategories.subcategoryId,
                        branchStatus: branchSubcategories.status,
                        branchIsOutOfStock: branchSubcategories.isOutOfStock,
                    })
                    .from(branchSubcategories)
                    .where(
                        and(
                            eq(branchSubcategories.branchId, singleBranchId),
                            inArray(branchSubcategories.subcategoryId, uniqueSubcategoryIds)
                        )
                    );
                for (const row of branchSubcatRows) {
                    branchSubcategoryStatusMap[row.subcategoryId] = row.branchStatus;
                    branchSubcategoryOosMap[row.subcategoryId] = Boolean(row.branchIsOutOfStock);
                }
            }

            // Fetch subcategory base info including isOutOfStock
            const subcategoryData = await db
                .select({
                    id: subcategories.id,
                    name: subcategories.name,
                    nameAr: subcategories.nameAr,
                    nameFr: subcategories.nameFr,
                    status: subcategories.status,
                    isOutOfStock: subcategories.isOutOfStock,
                })
                .from(subcategories)
                .where(inArray(subcategories.id, uniqueSubcategoryIds));

            for (const sub of subcategoryData) {
                const rollup = rollupMap[sub.id];
                // If branchId was provided, use branch-level override status (fallback to global)
                const status = singleBranchId
                    ? (branchSubcategoryStatusMap[sub.id] ?? sub.status)
                    : sub.status;

                // Priority: branchSubcategory.isOutOfStock > subcategory.isOutOfStock > food rollup
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
                subcategories: subcategoryResult,
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
            globalStatus: food.status,
            isOutOfStock: food.isOutOfStock,
            points: food.points,
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

    const branchStatusRows = branchIds.length > 0
        ? await db
            .select({
                foodId: branchMenuItems.foodId,
                branchId: branchMenuItems.branchId,
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

    const foodOverrideConditions = [inArray(foodPricingOverrides.foodId, foodIds)];
    if (branchIds.length > 0) {
        foodOverrideConditions.push(
            or(inArray(foodPricingOverrides.branchId, branchIds), isNull(foodPricingOverrides.branchId))!
        );
    }
    if (serviceModules.length > 0) {
        foodOverrideConditions.push(
            or(inArray(foodPricingOverrides.serviceModule, serviceModules), isNull(foodPricingOverrides.serviceModule))!
        );
    }

    const foodOverrideList = await db
        .select({
            id: foodPricingOverrides.id,
            foodId: foodPricingOverrides.foodId,
            branchId: foodPricingOverrides.branchId,
            serviceModule: foodPricingOverrides.serviceModule,
            price: foodPricingOverrides.price,
            status: foodPricingOverrides.status,
        })
        .from(foodPricingOverrides)
        .where(and(...foodOverrideConditions));

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
    const variantOverrideConditions = optionIds.length > 0 ? [inArray(variantPricingOverrides.variantId, optionIds)] : [];
    if (branchIds.length > 0 && variantOverrideConditions.length > 0) {
        variantOverrideConditions.push(
            or(inArray(variantPricingOverrides.branchId, branchIds), isNull(variantPricingOverrides.branchId))!
        );
    }
    if (serviceModules.length > 0 && variantOverrideConditions.length > 0) {
        variantOverrideConditions.push(
            or(inArray(variantPricingOverrides.serviceModule, serviceModules), isNull(variantPricingOverrides.serviceModule))!
        );
    }

    const variantOverrideList = optionIds.length > 0
        ? await db
            .select({
                id: variantPricingOverrides.id,
                variantId: variantPricingOverrides.variantId,
                branchId: variantPricingOverrides.branchId,
                serviceModule: variantPricingOverrides.serviceModule,
                price: variantPricingOverrides.price,
                status: variantPricingOverrides.status,
            })
            .from(variantPricingOverrides)
            .where(and(...variantOverrideConditions))
        : [];

    // Assemble final menu
    const finalMenu = rawFoods.map((f) => {
        const itemOverrides = foodOverrideList.filter((b) => b.foodId === f.id);
        const itemBranchOverrides = itemOverrides.filter((b) => b.serviceModule == null);
        const itemChannels = itemOverrides.filter((b) => b.serviceModule != null);

        const singleBranch = branchIds.length === 1 ? branchIds[0] : null;
        const branchStatus = singleBranch
            ? branchStatusRows.find((b) => b.foodId === f.id && b.branchId === singleBranch)
            : null;
        const status = branchStatus?.status ?? f.globalStatus;

        const itemVariations = allVariations
            .filter((v) => v.foodId === f.id)
            .map((v) => {
                const options = allOptions
                    .filter((o) => o.variationId === v.id)
                    .map((o) => {
                        const optOverrides = variantOverrideList.filter((vc) => vc.variantId === o.id);
                        const winning = pickBestOverride(optOverrides);
                        return {
                            id: o.id,
                            name: o.optionName,
                            nameAr: o.optionNameAr,
                            baseAdditionalPrice: o.additionalPrice,
                            price: winning?.price || o.additionalPrice,
                            channelPricing: optOverrides.filter((ov) => ov.serviceModule != null),
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

        const winningFood = pickBestOverride(itemOverrides);

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
            status,
            isOutOfStock: Boolean(f.isOutOfStock),
            isAvailable: true,
            branchOverrides: itemBranchOverrides,
            channelPricing: itemChannels,
            finalCalculatedPrice: winningFood?.price || f.mainBasePrice,
            variations: itemVariations,
        };
    });

    // ── Subcategory rollup (multi-branch path) ────────────────────────────────
    // Compute food rollup AND branch-level subcategory status per branch.
    const uniqueSubcategoryIds = [
        ...new Set(
            finalMenu.map((item) => item.subcategoryId).filter(Boolean) as string[]
        ),
    ];

    const subcategoryResult: any[] = [];
    if (uniqueSubcategoryIds.length > 0) {
        // All foods (active + inactive) for rollup
        const allFoodsForRollup = await db
            .select({
                subcategoryId: food.subcategoryid,
                status: food.status,
                isOutOfStock: food.isOutOfStock,
            })
            .from(food)
            .where(
                and(
                    eq(food.restaurantid, restaurantId!),
                    inArray(food.subcategoryid, uniqueSubcategoryIds)
                )
            );

        const rollupMap: Record<string, { allInactive: boolean; allOutOfStock: boolean; hasProducts: boolean }> = {};
        for (const row of allFoodsForRollup) {
            const sid = row.subcategoryId!;
            if (!rollupMap[sid]) {
                rollupMap[sid] = { allInactive: true, allOutOfStock: true, hasProducts: false };
            }
            rollupMap[sid].hasProducts = true;
            if (row.status !== "inactive") rollupMap[sid].allInactive = false;
            if (!row.isOutOfStock) rollupMap[sid].allOutOfStock = false;
        }

        // Fetch branch-level subcategory status + isOutOfStock for all requested branches
        // branchStatusMap[subcategoryId][branchId] = status
        // branchOosMap[subcategoryId][branchId] = isOutOfStock
        const branchStatusMap: Record<string, Record<string, string>> = {};
        const branchOosMap: Record<string, Record<string, boolean>> = {};
        if (branchIds.length > 0) {
            const branchSubcatRows = await db
                .select({
                    subcategoryId: branchSubcategories.subcategoryId,
                    branchId: branchSubcategories.branchId,
                    branchStatus: branchSubcategories.status,
                    branchIsOutOfStock: branchSubcategories.isOutOfStock,
                })
                .from(branchSubcategories)
                .where(
                    and(
                        inArray(branchSubcategories.branchId, branchIds),
                        inArray(branchSubcategories.subcategoryId, uniqueSubcategoryIds)
                    )
                );
            for (const row of branchSubcatRows) {
                if (!branchStatusMap[row.subcategoryId]) {
                    branchStatusMap[row.subcategoryId] = {};
                    branchOosMap[row.subcategoryId] = {};
                }
                branchStatusMap[row.subcategoryId][row.branchId] = row.branchStatus;
                branchOosMap[row.subcategoryId][row.branchId] = Boolean(row.branchIsOutOfStock);
            }
        }

        const subcategoryData = await db
            .select({
                id: subcategories.id,
                name: subcategories.name,
                nameAr: subcategories.nameAr,
                nameFr: subcategories.nameFr,
                status: subcategories.status,
                isOutOfStock: subcategories.isOutOfStock,
            })
            .from(subcategories)
            .where(inArray(subcategories.id, uniqueSubcategoryIds));

        for (const sub of subcategoryData) {
            const rollup = rollupMap[sub.id];
            // If a single branchId is provided, use its override status (fallback to global)
            // For multi-branch, use global status as base
            const branchStatuses = branchStatusMap[sub.id] ?? {};
            const branchOoses = branchOosMap[sub.id] ?? {};
            const singleBranch = branchIds.length === 1 ? branchIds[0] : null;
            const status = singleBranch
                ? (branchStatuses[singleBranch] ?? sub.status)
                : sub.status;

            // Priority: branchSubcategory.isOutOfStock > subcategory.isOutOfStock > food rollup
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

    return SuccessResponse(res, {
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

            // branchId can be an array of branch IDs, "all" (all branches + global), single branch ID, null (global), or undefined
            const rawBranch = entry.branchId;
            let targetBranches: Array<string | null>;
            if (rawBranch === undefined || rawBranch === null || rawBranch === "" || rawBranch === "global") {
                targetBranches = [null];
            } else {
                const parsedBranches = parseArrayParam(rawBranch);
                if (parsedBranches.includes("all")) {
                    const allRestaurantBranches = await tx
                        .select({ id: branches.id })
                        .from(branches)
                        .where(and(eq(branches.restaurantId, restaurantId), eq(branches.status, "active")));
                    const branchIds = allRestaurantBranches.map((b: any) => b.id);
                    targetBranches = [...branchIds, null];
                } else {
                    targetBranches = parsedBranches.length > 0 ? parsedBranches : [null];
                }
            }

            // serviceModule can be an array ("takeaway", "delivery"), single string, or "all"
            const rawModule = entry.serviceModule;
            let targetModules: ServiceModule[];
            const parsedModules = parseArrayParam(rawModule);
            if (!rawModule || rawModule === "all" || parsedModules.includes("all" as any) || parsedModules.length === 0) {
                targetModules = ["takeaway", "dine_in", "delivery"];
            } else {
                targetModules = parsedModules as ServiceModule[];
            }

            if (targetModules.length === 0)
                throw new BadRequest("serviceModule is required (e.g. takeaway, dine_in, delivery, all)");

            const priceVal = String(entry.price);
            const statusVal: "active" | "inactive" = entry.status === "inactive" ? "inactive" : "active";

            for (const targetBranchId of targetBranches) {
                for (const module of targetModules) {
                    await upsertFoodPricingOverride(tx, {
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

            // branchId can be an array of branch IDs, "all" (all branches + global), single branch ID, null (global), or undefined
            const rawBranch = entry.branchId;
            let targetBranches: Array<string | null>;
            if (rawBranch === undefined || rawBranch === null || rawBranch === "" || rawBranch === "global") {
                targetBranches = [null];
            } else {
                const parsedBranches = parseArrayParam(rawBranch);
                if (parsedBranches.includes("all")) {
                    const allRestaurantBranches = await tx
                        .select({ id: branches.id })
                        .from(branches)
                        .where(and(eq(branches.restaurantId, restaurantId), eq(branches.status, "active")));
                    const branchIds = allRestaurantBranches.map((b: any) => b.id);
                    targetBranches = [...branchIds, null];
                } else {
                    targetBranches = parsedBranches.length > 0 ? parsedBranches : [null];
                }
            }

            // serviceModule can be an array ("takeaway", "delivery"), single string, or "all"
            const rawModule = entry.serviceModule;
            let targetModules: ServiceModule[];
            const parsedModules = parseArrayParam(rawModule);
            if (!rawModule || rawModule === "all" || parsedModules.includes("all" as any) || parsedModules.length === 0) {
                targetModules = ["takeaway", "dine_in", "delivery"];
            } else {
                targetModules = parsedModules as ServiceModule[];
            }

            if (targetModules.length === 0)
                throw new BadRequest("serviceModule is required (e.g. takeaway, dine_in, delivery, all)");

            const priceVal = String(entry.price);
            const statusVal: "active" | "inactive" = entry.status === "inactive" ? "inactive" : "active";

            for (const targetBranchId of targetBranches) {
                for (const module of targetModules) {
                    await upsertVariantPricingOverride(tx, {
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

    return SuccessResponse(res, { message: "Variant channel pricing saved successfully" });
};



