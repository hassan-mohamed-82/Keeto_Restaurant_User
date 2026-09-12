// src/helpers/food.helper.ts
import {
    branchIngredientLocks,
    branchMenuItems,
    foodIngredients,
    branches,
    food,
    ingredients,
    foodVariations,
    variationOptions,
    variantPricingOverrides,
} from "../models/schema";
import { eq, and, inArray, or, isNull } from "drizzle-orm";
import { db } from "../models/connection";

export interface FoodAvailabilityCheckParams {
    foodId: string;
    restaurantId?: string;
    branchId?: string | null;
}

export interface FoodAvailabilityResult {
    isAvailable: boolean;
    reason?: string;
    details?: {
        foodStatus?: string;
        isOutOfStock?: boolean;
        branchMenuItemStatus?: string;
        branchStockQty?: number;
        branchStockType?: string;
        unavailableIngredients?: { id: string; name: string; reason: string }[];
        unavailableVariations?: { id: string; name: string; reason: string }[];
    };
}

// ==========================================
// نوع بيانات الفرع المُعاد
// ==========================================
export type BranchInfo = {
    id: string;
    name: string;
    nameAr: string | null;
    nameFr: string | null;
};

/**
 * تحدد الفروع غير المتاحة لكل وجبة من قائمة الوجبات الممررة.
 * تتم عملية الفحص بناءً على شرطين:
 * 1. حالة الوجبة بالفرع (غير نشطة inactive أو نفد مخزونها المحدود).
 * 2. إغلاق أحد المكونات الأساسية (essential) للوجبة على مستوى الفرع.
 *
 * @param foodIds قائمة معرفات الوجبات المراد فحصها
 * @returns Map تحتوي على foodId كمفتاح وقائمة بكائنات الفروع غير المتاحة له كقيمة
 */
export const getUnavailableBranchesForFoods = async (
    foodIds: string[]
): Promise<Map<string, BranchInfo[]>> => {
    // تهيئة خريطة النتائج باستخدام Map داخلية لمنع تكرار الفروع (مفتاحها branchId)
    const unavailableBranchesMap = new Map<string, Map<string, BranchInfo>>();

    if (foodIds.length === 0) return new Map();

    foodIds.forEach((id) => unavailableBranchesMap.set(id, new Map()));

    // 1. فحص جدول إعدادات الوجبة بالفرع (branch_menu_items): إيجاد الفروع التي أوقفت الوجبة أو نفد مخزونها
    const disabledMenuItems = await db
        .select({
            foodId: branchMenuItems.foodId,
            branchId: branchMenuItems.branchId,
            stockType: branchMenuItems.stockType,
            stockQty: branchMenuItems.stockQty,
            status: branchMenuItems.status,
            branchName: branches.name,
            branchNameAr: branches.nameAr,
            branchNameFr: branches.nameFr,
        })
        .from(branchMenuItems)
        .leftJoin(branches, eq(branchMenuItems.branchId, branches.id))
        .where(inArray(branchMenuItems.foodId, foodIds));

    for (const item of disabledMenuItems) {
        const isOutOfStock = item.stockType === "limited" && (item.stockQty ?? 0) <= 0;
        const isInactive = item.status === "inactive";

        // إذا كانت الوجبة غير نشطة أو نفد مخزونها، يُضاف الفرع لقائمة الفروع غير المتاحة لهذه الوجبة
        if (isInactive || isOutOfStock) {
            const branchInfo: BranchInfo = {
                id: item.branchId,
                name: item.branchName ?? item.branchId,
                nameAr: item.branchNameAr ?? null,
                nameFr: item.branchNameFr ?? null,
            };
            unavailableBranchesMap.get(item.foodId)?.set(item.branchId, branchInfo);
        }
    }

    // 2. فحص المكونات: جلب معرفات المكونات الأساسية (isEssential = true) المرتبطة بهذه الوجبات
    const essentialIngredients = await db
        .select({
            foodId: foodIngredients.foodId,
            ingredientId: foodIngredients.ingredientId,
        })
        .from(foodIngredients)
        .where(and(
            inArray(foodIngredients.foodId, foodIds),
            eq(foodIngredients.isEssential, true)
        ));

    if (essentialIngredients.length > 0) {
        const essentialIngredientIds = [...new Set(essentialIngredients.map((i) => i.ingredientId))];

        // 3. فحص أقفال المكونات (branch_ingredient_locks): جلب الأقفال النشطة للمكونات الأساسية
        // يشمل الأقفال العامة على المكون (null) أو الأقفال المخصصة لوجبة محددة
        const activeLocks = await db
            .select({
                branchId: branchIngredientLocks.branchId,
                foodId: branchIngredientLocks.foodId,
                ingredientId: branchIngredientLocks.ingredientId,
                branchName: branches.name,
                branchNameAr: branches.nameAr,
                branchNameFr: branches.nameFr,
            })
            .from(branchIngredientLocks)
            .leftJoin(branches, eq(branchIngredientLocks.branchId, branches.id))
            .where(and(
                inArray(branchIngredientLocks.ingredientId, essentialIngredientIds),
                eq(branchIngredientLocks.isAvailable, false),
                or(
                    inArray(branchIngredientLocks.foodId, foodIds),
                    isNull(branchIngredientLocks.foodId)
                )
            ));

        // مطابقة القفل بالوجبة والمكون الخاص بها لإضافة الفرع إلى القائمة عند التأثر
        for (const lock of activeLocks) {
            for (const item of essentialIngredients) {
                if (item.ingredientId === lock.ingredientId) {
                    // القفل يطبق إما على الوجبة المحددة أو على كل الوجبات التي تستخدم المكون إذا كان foodId خاليًا (null)
                    if (!lock.foodId || lock.foodId === item.foodId) {
                        const branchInfo: BranchInfo = {
                            id: lock.branchId,
                            name: lock.branchName ?? lock.branchId,
                            nameAr: lock.branchNameAr ?? null,
                            nameFr: lock.branchNameFr ?? null,
                        };
                        unavailableBranchesMap.get(item.foodId)?.set(lock.branchId, branchInfo);
                    }
                }
            }
        }
    }

    // 4. تحويل نتائج الـ Map الداخلية إلى Array وتنسيق البنية النهائية للـ Map
    const resultMap = new Map<string, BranchInfo[]>();
    unavailableBranchesMap.forEach((branchMap, foodId) => {
        resultMap.set(foodId, Array.from(branchMap.values()));
    });

    return resultMap;
};

/**
 * فحص احترافي وشامل لتوافر الوجبة ومكوناتها وخياراتها (Variations) سواء على المستوى العام أو لفرع محدد.
 * 
 * يفحص:
 * 1. وجود الوجبة وحالتها العامة (نشطة / موقوفة / نفاد مخزون عام).
 * 2. حالة الوجبة داخل الفرع الممرر (active / inactive / نفاد المخزون المحدود).
 * 3. المكونات الأساسية للوجبة (isEssential) ومخزونها العام، وأقفال المكونات داخل الفرع (branchIngredientLocks).
 * 4. خيارات الوجبة الإلزامية (Required Variations) وتوافرها بالفرع عبر variantPricingOverrides.
 */
export const checkFoodAvailabilityInBranch = async ({
    foodId,
    restaurantId,
    branchId,
}: FoodAvailabilityCheckParams): Promise<FoodAvailabilityResult> => {
    // ----------------------------------------------------
    // 1. فحص الوجبة في الكتالوج العام للمطعم
    // ----------------------------------------------------
    const [foodItem] = await db
        .select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            status: food.status,
            isOutOfStock: food.isOutOfStock,
            restaurantid: food.restaurantid,
        })
        .from(food)
        .where(
            restaurantId
                ? and(eq(food.id, foodId), eq(food.restaurantid, restaurantId))
                : eq(food.id, foodId)
        )
        .limit(1);

    if (!foodItem) {
        return {
            isAvailable: false,
            reason: "الوجبة غير موجودة في قائمة هذا المطعم",
            details: { foodExists: false } as any,
        };
    }

    const foodDisplayName = foodItem.nameAr || foodItem.name;

    if (foodItem.status === "inactive") {
        return {
            isAvailable: false,
            reason: `الوجبة (${foodDisplayName}) غير مفعلة حالياً`,
            details: { foodStatus: "inactive", isOutOfStock: !!foodItem.isOutOfStock },
        };
    }

    if (foodItem.isOutOfStock) {
        return {
            isAvailable: false,
            reason: `الوجبة (${foodDisplayName}) غير متوفرة في المخزون العام للمطعم`,
            details: { foodStatus: foodItem.status || "active", isOutOfStock: true },
        };
    }

    // ----------------------------------------------------
    // 2. فحص إعدادات وتوفر الوجبة في الفرع (branchMenuItems)
    // ----------------------------------------------------
    if (branchId) {
        const [branchItem] = await db
            .select({
                id: branchMenuItems.id,
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
            .limit(1);

        if (branchItem) {
            if (branchItem.status === "inactive") {
                return {
                    isAvailable: false,
                    reason: `الوجبة (${foodDisplayName}) موقوفة حالياً في هذا الفرع`,
                    details: {
                        branchMenuItemStatus: "inactive",
                        branchStockType: branchItem.stockType || undefined,
                        branchStockQty: branchItem.stockQty ?? undefined,
                    },
                };
            }

            if (branchItem.stockType === "limited" && (branchItem.stockQty ?? 0) <= 0) {
                return {
                    isAvailable: false,
                    reason: `نفد مخزون الوجبة (${foodDisplayName}) في هذا الفرع`,
                    details: {
                        branchMenuItemStatus: branchItem.status,
                        branchStockType: "limited",
                        branchStockQty: branchItem.stockQty ?? 0,
                    },
                };
            }
        }
    }

    // ----------------------------------------------------
    // 3. فحص المكونات الأساسية وأقفال الفرع (Ingredients & Locks)
    // ----------------------------------------------------
    const foodIngs = await db
        .select({
            ingredientId: foodIngredients.ingredientId,
            isEssential: foodIngredients.isEssential,
            name: ingredients.name,
            nameAr: ingredients.nameAr,
            inStock: ingredients.inStock,
        })
        .from(foodIngredients)
        .innerJoin(ingredients, eq(foodIngredients.ingredientId, ingredients.id))
        .where(eq(foodIngredients.foodId, foodId));

    const unavailableIngredients: { id: string; name: string; reason: string }[] = [];

    for (const ing of foodIngs) {
        if (ing.isEssential && ing.inStock === false) {
            unavailableIngredients.push({
                id: ing.ingredientId,
                name: ing.nameAr || ing.name,
                reason: "المكون غير متوفر في المخزون العام",
            });
        }
    }

    if (branchId && foodIngs.length > 0) {
        const essentialIngIds = foodIngs
            .filter((i) => i.isEssential)
            .map((i) => i.ingredientId);

        if (essentialIngIds.length > 0) {
            const locks = await db
                .select({
                    ingredientId: branchIngredientLocks.ingredientId,
                    foodId: branchIngredientLocks.foodId,
                    isAvailable: branchIngredientLocks.isAvailable,
                })
                .from(branchIngredientLocks)
                .where(
                    and(
                        eq(branchIngredientLocks.branchId, branchId),
                        inArray(branchIngredientLocks.ingredientId, essentialIngIds),
                        eq(branchIngredientLocks.isAvailable, false),
                        or(
                            eq(branchIngredientLocks.foodId, foodId),
                            isNull(branchIngredientLocks.foodId)
                        )
                    )
                );

            for (const lock of locks) {
                const ing = foodIngs.find((i) => i.ingredientId === lock.ingredientId);
                if (ing && !unavailableIngredients.some((u) => u.id === ing.ingredientId)) {
                    unavailableIngredients.push({
                        id: ing.ingredientId,
                        name: ing.nameAr || ing.name,
                        reason: "المكون موقوف في هذا الفرع",
                    });
                }
            }
        }
    }

    if (unavailableIngredients.length > 0) {
        const names = unavailableIngredients.map((i) => i.name).join("، ");
        return {
            isAvailable: false,
            reason: `المكون الأساسي (${names}) غير متاح حالياً`,
            details: { unavailableIngredients },
        };
    }

    // ----------------------------------------------------
    // 4. فحص الـ Variations الإلزامية وخياراتها بالفرع
    // ----------------------------------------------------
    const variations = await db
        .select({
            id: foodVariations.id,
            name: foodVariations.name,
            nameAr: foodVariations.nameAr,
            isRequired: foodVariations.isRequired,
            status: foodVariations.status,
        })
        .from(foodVariations)
        .where(eq(foodVariations.foodId, foodId));

    if (variations.length > 0) {
        const unavailableVariations: { id: string; name: string; reason: string }[] = [];

        for (const v of variations) {
            if (v.isRequired) {
                const varName = v.nameAr || v.name;

                if (v.status === false) {
                    unavailableVariations.push({
                        id: v.id,
                        name: varName,
                        reason: "مجموعة الخيارات الإلزامية معطلة بالكامل",
                    });
                    continue;
                }

                const options = await db
                    .select({
                        id: variationOptions.id,
                        optionName: variationOptions.optionName,
                        optionNameAr: variationOptions.optionNameAr,
                        status: variationOptions.status,
                    })
                    .from(variationOptions)
                    .where(eq(variationOptions.variationId, v.id));

                if (options.length === 0) {
                    unavailableVariations.push({
                        id: v.id,
                        name: varName,
                        reason: "لا توجد خيارات مضافة لهذا الصنف الإلزامي",
                    });
                    continue;
                }

                const globallyActiveOptions = options.filter((o) => o.status !== false);

                if (globallyActiveOptions.length === 0) {
                    unavailableVariations.push({
                        id: v.id,
                        name: varName,
                        reason: "جميع خيارات هذا الصنف معطلة عاماً",
                    });
                    continue;
                }

                if (branchId) {
                    const optIds = globallyActiveOptions.map((o) => o.id);
                    const branchVariantOverrides = await db
                        .select({
                            variantId: variantPricingOverrides.variantId,
                            status: variantPricingOverrides.status,
                        })
                        .from(variantPricingOverrides)
                        .where(
                            and(
                                eq(variantPricingOverrides.branchId, branchId),
                                inArray(variantPricingOverrides.variantId, optIds)
                            )
                        );

                    const inactiveVariantIds = new Set(
                        branchVariantOverrides
                            .filter((o) => o.status === "inactive")
                            .map((o) => o.variantId)
                    );

                    const availableInBranchOptions = globallyActiveOptions.filter(
                        (o) => !inactiveVariantIds.has(o.id)
                    );

                    if (availableInBranchOptions.length === 0) {
                        unavailableVariations.push({
                            id: v.id,
                            name: varName,
                            reason: "جميع خيارات هذا الصنف الإلزامي موقوفة في هذا الفرع",
                        });
                    }
                }
            }
        }

        if (unavailableVariations.length > 0) {
            const names = unavailableVariations.map((v) => v.name).join("، ");
            return {
                isAvailable: false,
                reason: `خيارات الوجبة الإلزامية (${names}) غير متاحة في هذا الفرع`,
                details: { unavailableVariations },
            };
        }
    }

    return {
        isAvailable: true,
    };
};