"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFoodAvailabilityInBranch = exports.getUnavailableBranchesForFoods = void 0;
// src/helpers/food.helper.ts
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const connection_1 = require("../models/connection");
/**
 * تحدد الفروع غير المتاحة لكل وجبة من قائمة الوجبات الممررة.
 * تتم عملية الفحص بناءً على شرطين:
 * 1. حالة الوجبة بالفرع (غير نشطة inactive أو نفد مخزونها المحدود).
 * 2. إغلاق أحد المكونات الأساسية (essential) للوجبة على مستوى الفرع.
 *
 * @param foodIds قائمة معرفات الوجبات المراد فحصها
 * @returns Map تحتوي على foodId كمفتاح وقائمة بكائنات الفروع غير المتاحة له كقيمة
 */
const getUnavailableBranchesForFoods = async (foodIds) => {
    // تهيئة خريطة النتائج باستخدام Map داخلية لمنع تكرار الفروع (مفتاحها branchId)
    const unavailableBranchesMap = new Map();
    if (foodIds.length === 0)
        return new Map();
    foodIds.forEach((id) => unavailableBranchesMap.set(id, new Map()));
    // 1. فحص جدول إعدادات الوجبة بالفرع (branch_menu_items): إيجاد الفروع التي أوقفت الوجبة أو نفد مخزونها
    const disabledMenuItems = await connection_1.db
        .select({
        foodId: schema_1.branchMenuItems.foodId,
        branchId: schema_1.branchMenuItems.branchId,
        stockType: schema_1.branchMenuItems.stockType,
        stockQty: schema_1.branchMenuItems.stockQty,
        status: schema_1.branchMenuItems.status,
        branchName: schema_1.branches.name,
        branchNameAr: schema_1.branches.nameAr,
        branchNameFr: schema_1.branches.nameFr,
    })
        .from(schema_1.branchMenuItems)
        .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, schema_1.branches.id))
        .where((0, drizzle_orm_1.inArray)(schema_1.branchMenuItems.foodId, foodIds));
    for (const item of disabledMenuItems) {
        const isOutOfStock = item.stockType === "limited" && (item.stockQty ?? 0) <= 0;
        const isInactive = item.status === "inactive";
        // إذا كانت الوجبة غير نشطة أو نفد مخزونها، يُضاف الفرع لقائمة الفروع غير المتاحة لهذه الوجبة
        if (isInactive || isOutOfStock) {
            const branchInfo = {
                id: item.branchId,
                name: item.branchName ?? item.branchId,
                nameAr: item.branchNameAr ?? null,
                nameFr: item.branchNameFr ?? null,
            };
            unavailableBranchesMap.get(item.foodId)?.set(item.branchId, branchInfo);
        }
    }
    // 2. فحص المكونات: جلب معرفات المكونات الأساسية (isEssential = true) المرتبطة بهذه الوجبات
    const essentialIngredients = await connection_1.db
        .select({
        foodId: schema_1.foodIngredients.foodId,
        ingredientId: schema_1.foodIngredients.ingredientId,
    })
        .from(schema_1.foodIngredients)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.foodIngredients.foodId, foodIds), (0, drizzle_orm_1.eq)(schema_1.foodIngredients.isEssential, true)));
    if (essentialIngredients.length > 0) {
        const essentialIngredientIds = [...new Set(essentialIngredients.map((i) => i.ingredientId))];
        // 3. فحص أقفال المكونات (branch_ingredient_locks): جلب الأقفال النشطة للمكونات الأساسية
        // يشمل الأقفال العامة على المكون (null) أو الأقفال المخصصة لوجبة محددة
        const activeLocks = await connection_1.db
            .select({
            branchId: schema_1.branchIngredientLocks.branchId,
            foodId: schema_1.branchIngredientLocks.foodId,
            ingredientId: schema_1.branchIngredientLocks.ingredientId,
            branchName: schema_1.branches.name,
            branchNameAr: schema_1.branches.nameAr,
            branchNameFr: schema_1.branches.nameFr,
        })
            .from(schema_1.branchIngredientLocks)
            .leftJoin(schema_1.branches, (0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.branchId, schema_1.branches.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.branchIngredientLocks.ingredientId, essentialIngredientIds), (0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.isAvailable, false), (0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema_1.branchIngredientLocks.foodId, foodIds), (0, drizzle_orm_1.isNull)(schema_1.branchIngredientLocks.foodId))));
        // مطابقة القفل بالوجبة والمكون الخاص بها لإضافة الفرع إلى القائمة عند التأثر
        for (const lock of activeLocks) {
            for (const item of essentialIngredients) {
                if (item.ingredientId === lock.ingredientId) {
                    // القفل يطبق إما على الوجبة المحددة أو على كل الوجبات التي تستخدم المكون إذا كان foodId خاليًا (null)
                    if (!lock.foodId || lock.foodId === item.foodId) {
                        const branchInfo = {
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
    const resultMap = new Map();
    unavailableBranchesMap.forEach((branchMap, foodId) => {
        resultMap.set(foodId, Array.from(branchMap.values()));
    });
    return resultMap;
};
exports.getUnavailableBranchesForFoods = getUnavailableBranchesForFoods;
/**
 * فحص احترافي وشامل لتوافر الوجبة ومكوناتها وخياراتها (Variations) سواء على المستوى العام أو لفرع محدد.
 *
 * يفحص:
 * 1. وجود الوجبة وحالتها العامة (نشطة / موقوفة / نفاد مخزون عام).
 * 2. حالة الوجبة داخل الفرع الممرر (active / inactive / نفاد المخزون المحدود).
 * 3. المكونات الأساسية للوجبة (isEssential) ومخزونها العام، وأقفال المكونات داخل الفرع (branchIngredientLocks).
 * 4. خيارات الوجبة الإلزامية (Required Variations) وتوافرها بالفرع عبر branchVariantPricing.
 */
const checkFoodAvailabilityInBranch = async ({ foodId, restaurantId, branchId, }) => {
    // ----------------------------------------------------
    // 1. فحص الوجبة في الكتالوج العام للمطعم
    // ----------------------------------------------------
    const [foodItem] = await connection_1.db
        .select({
        id: schema_1.food.id,
        name: schema_1.food.name,
        nameAr: schema_1.food.nameAr,
        status: schema_1.food.status,
        isOutOfStock: schema_1.food.isOutOfStock,
        restaurantid: schema_1.food.restaurantid,
    })
        .from(schema_1.food)
        .where(restaurantId
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.food.id, foodId), (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId))
        : (0, drizzle_orm_1.eq)(schema_1.food.id, foodId))
        .limit(1);
    if (!foodItem) {
        return {
            isAvailable: false,
            reason: "الوجبة غير موجودة في قائمة هذا المطعم",
            details: { foodExists: false },
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
        const [branchItem] = await connection_1.db
            .select({
            id: schema_1.branchMenuItems.id,
            status: schema_1.branchMenuItems.status,
            stockType: schema_1.branchMenuItems.stockType,
            stockQty: schema_1.branchMenuItems.stockQty,
        })
            .from(schema_1.branchMenuItems)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchMenuItems.foodId, foodId), (0, drizzle_orm_1.eq)(schema_1.branchMenuItems.branchId, branchId)))
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
    const foodIngs = await connection_1.db
        .select({
        ingredientId: schema_1.foodIngredients.ingredientId,
        isEssential: schema_1.foodIngredients.isEssential,
        name: schema_1.ingredients.name,
        nameAr: schema_1.ingredients.nameAr,
        inStock: schema_1.ingredients.inStock,
    })
        .from(schema_1.foodIngredients)
        .innerJoin(schema_1.ingredients, (0, drizzle_orm_1.eq)(schema_1.foodIngredients.ingredientId, schema_1.ingredients.id))
        .where((0, drizzle_orm_1.eq)(schema_1.foodIngredients.foodId, foodId));
    const unavailableIngredients = [];
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
            const locks = await connection_1.db
                .select({
                ingredientId: schema_1.branchIngredientLocks.ingredientId,
                foodId: schema_1.branchIngredientLocks.foodId,
                isAvailable: schema_1.branchIngredientLocks.isAvailable,
            })
                .from(schema_1.branchIngredientLocks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.branchId, branchId), (0, drizzle_orm_1.inArray)(schema_1.branchIngredientLocks.ingredientId, essentialIngIds), (0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.isAvailable, false), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.branchIngredientLocks.foodId, foodId), (0, drizzle_orm_1.isNull)(schema_1.branchIngredientLocks.foodId))));
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
    const variations = await connection_1.db
        .select({
        id: schema_1.foodVariations.id,
        name: schema_1.foodVariations.name,
        nameAr: schema_1.foodVariations.nameAr,
        isRequired: schema_1.foodVariations.isRequired,
        status: schema_1.foodVariations.status,
    })
        .from(schema_1.foodVariations)
        .where((0, drizzle_orm_1.eq)(schema_1.foodVariations.foodId, foodId));
    if (variations.length > 0) {
        const unavailableVariations = [];
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
                const options = await connection_1.db
                    .select({
                    id: schema_1.variationOptions.id,
                    optionName: schema_1.variationOptions.optionName,
                    optionNameAr: schema_1.variationOptions.optionNameAr,
                    status: schema_1.variationOptions.status,
                })
                    .from(schema_1.variationOptions)
                    .where((0, drizzle_orm_1.eq)(schema_1.variationOptions.variationId, v.id));
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
                    const branchVariantOverrides = await connection_1.db
                        .select({
                        variantId: schema_1.branchVariantPricing.variantId,
                        status: schema_1.branchVariantPricing.status,
                    })
                        .from(schema_1.branchVariantPricing)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branchVariantPricing.branchId, branchId), (0, drizzle_orm_1.inArray)(schema_1.branchVariantPricing.variantId, optIds)));
                    const inactiveVariantIds = new Set(branchVariantOverrides
                        .filter((o) => o.status === "inactive")
                        .map((o) => o.variantId));
                    const availableInBranchOptions = globallyActiveOptions.filter((o) => !inactiveVariantIds.has(o.id));
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
exports.checkFoodAvailabilityInBranch = checkFoodAvailabilityInBranch;
