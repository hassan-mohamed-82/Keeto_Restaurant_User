import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    branchMenuItems,
    food,
    branches,
    categories,
    branchIngredientLocks,
    foodIngredients,
} from "../../models/schema";
import { foodPricingOverrides } from "../../models/schema/admin/channelPricing";
import { eq, and, sql, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import redis from "../../config/redis";
import { upsertFoodPricingOverride } from "../../helpers/pricing.overrides";

// =============================================
// Helper: مسح كاش الفرع والمطعم بعد أي تعديل
// =============================================
const invalidateBranchMenuCache = async (branchId: string, restaurantId: string) => {
    await redis.del(`admin:branch_menu:${branchId}`);
    await redis.del(`admin:branch_select:${restaurantId}`);
};

// =============================================
// تعيين أكلة لفرع معين وتحديد سعرها ومخزونها
//
// ✅ FIX: `price` كان بيتكتب في branchMenuItems.price (جدول مسؤول أصلاً عن
// التوفر/المخزون بس). دلوقتي بيتكتب في foodPricingOverrides (branch-only،
// serviceModule = NULL) عن طريق upsertFoodPricingOverride، وbranchMenuItems
// بقى مسؤول فقط عن stockType/stockQty/status.
// =============================================
export const assignFoodToBranch = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId; // لو هو مدير فرع، مش هيقدر يعدل غير في فرعه

    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const { branchId, foodId, price, stockType, stockQty, status } = req.body;

    if (!branchId || !foodId || price === undefined) {
        throw new BadRequest("Missing required fields: branchId, foodId, price");
    }

    // 🚨 حماية: مدير الفرع ميعدلش في فرع غيره
    if (userBranchId && userBranchId !== branchId) {
        throw new BadRequest("Unauthorized: You can only manage menu items for your assigned branch");
    }

    // التأكد إن الفرع ده يخص المطعم
    const branchCheck = await db.select().from(branches)
        .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId))).limit(1);
    if (!branchCheck[0]) throw new NotFound("Branch not found or does not belong to your restaurant");

    // التأكد إن الأكلة دي موجودة فعلاً في الكتالوج بتاع المطعم ده
    const foodCheck = await db.select().from(food)
        .where(and(eq(food.id, foodId), eq(food.restaurantid, restaurantId))).limit(1);
    if (!foodCheck[0]) throw new NotFound("Food item not found in master catalog");

    const isNewAssignment = await db.transaction(async (tx) => {
        // ─── Price → foodPricingOverrides (branch-only, all service modules) ───
        await upsertFoodPricingOverride(tx, {
            foodId,
            branchId,
            serviceModule: null,
            price: String(price),
            status: "active",
        });

        // ─── Availability/stock → branchMenuItems ───────────────────────────
        const [existingBranchItem] = await tx.select().from(branchMenuItems)
            .where(and(eq(branchMenuItems.branchId, branchId), eq(branchMenuItems.foodId, foodId)))
            .limit(1);

        if (existingBranchItem) {
            await tx.update(branchMenuItems).set({
                stockType: stockType || "unlimited",
                stockQty: stockQty !== undefined ? stockQty : existingBranchItem.stockQty,
                status: status || existingBranchItem.status,
                updatedAt: new Date(),
            }).where(eq(branchMenuItems.id, existingBranchItem.id));
            return false;
        } else {
            await tx.insert(branchMenuItems).values({
                id: uuidv4(),
                branchId,
                foodId,
                stockType: stockType || "unlimited",
                stockQty: stockQty || 0,
                status: status || "active",
            });
            return true;
        }
    });

    await invalidateBranchMenuCache(branchId, restaurantId);

    return isNewAssignment
        ? SuccessResponse(res, { message: "Food assigned to branch successfully" }, 201)
        : SuccessResponse(res, { message: "Branch menu item updated successfully" });
};

// =============================================
// عرض منيو الفرع (دي اللي بترجع لتطبيق اليوزر)
//
// ✅ FIX: الـ COALESCE كان بياخد السعر من branchMenuItems.price مباشرة.
// دلوقتي بياخده من foodPricingOverrides (branch-only override) عن طريق join
// إضافي، وbranchMenuItems فضل بس لـ status/stockType/stockQty.
// =============================================
export const getBranchMenu = async (req: Request, res: Response) => {
    const { branchId } = req.params;

    // Get the restaurant ID for this branch
    const branchCheck = await db.select({ restaurantId: branches.restaurantId })
        .from(branches)
        .where(eq(branches.id, branchId))
        .limit(1);

    if (!branchCheck[0]) throw new NotFound("Branch not found");
    const restaurantId = branchCheck[0].restaurantId;

    // ✅ Redis Cache
    const cacheKey = `admin:branch_menu:${branchId}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        return SuccessResponse(res, { message: "Get branch menu success", data: JSON.parse(cachedData) });
    }

    // Branch-only price override (serviceModule IS NULL)
    const branchPriceOverride = alias(foodPricingOverrides, "branch_price_override");

    // الكتالوج الموحد مدمج مع استثناءات الفرع
    const rawBranchMenu = await db.select({
        menuItemId: branchMenuItems.id, // قد يكون null إذا لم يكن هناك استثناء
        foodId: food.id,
        name: food.name,
        nameAr: food.nameAr,
        nameFr: food.nameFr,
        description: food.description,
        descriptionAr: food.descriptionAr,
        descriptionFr: food.descriptionFr,
        image: food.image,
        foodIsOutOfStock: food.isOutOfStock,
        categoryId: food.categoryid,
        categoryName: categories.name,
        categoryNameAr: categories.nameAr,
        categoryNameFr: categories.nameFr,

        // السعر: override الفرع (لو موجود وactive) وإلا السعر الأساسي
        price: sql<number>`COALESCE(${branchPriceOverride.price}, ${food.price})`.as('price'),
        // التوفر/المخزون: من branchMenuItems فقط
        status: sql<string>`COALESCE(${branchMenuItems.status}, 'active')`.as('status'),
        stockType: sql<string>`COALESCE(${branchMenuItems.stockType}, ${food.stock_type})`.as('stock_type'),
        stockQty: sql<number>`COALESCE(${branchMenuItems.stockQty}, 0)`.as('stock_qty'),
    })
        .from(food)
        .leftJoin(branchMenuItems, and(
            eq(branchMenuItems.foodId, food.id),
            eq(branchMenuItems.branchId, branchId)
        ))
        .leftJoin(branchPriceOverride, and(
            eq(branchPriceOverride.foodId, food.id),
            eq(branchPriceOverride.branchId, branchId),
            isNull(branchPriceOverride.serviceModule),
            eq(branchPriceOverride.status, "active")
        ))
        .leftJoin(categories, eq(food.categoryid, categories.id))
        .where(eq(food.restaurantid, restaurantId));

    // استخراج المنتجات غير المتاحة بسبب مكون أساسي مفقود في الفرع
    const lockedEssentialIngredients = await db.select({
        foodId: branchIngredientLocks.foodId
    })
        .from(branchIngredientLocks)
        .innerJoin(foodIngredients, eq(branchIngredientLocks.ingredientId, foodIngredients.ingredientId))
        .where(
            and(
                eq(branchIngredientLocks.branchId, branchId),
                eq(branchIngredientLocks.isAvailable, false),
                eq(foodIngredients.isEssential, true),
                eq(foodIngredients.foodId, branchIngredientLocks.foodId)
            )
        );

    const unavailableFoodIds = new Set(lockedEssentialIngredients.map(lock => lock.foodId));

    // إضافة حقل isAvailable لكل منتج
    const branchMenu = rawBranchMenu.map(item => {
        const isAvailable =
            item.status === "active" &&
            !item.foodIsOutOfStock &&
            !unavailableFoodIds.has(item.foodId);

        return {
            ...item,
            isAvailable
        };
    });

    // ✅ Cache for 30 minutes
    await redis.set(cacheKey, JSON.stringify(branchMenu), 'EX', 1800);

    return SuccessResponse(res, { message: "Get branch menu success", data: branchMenu });
};

// =============================================
// ✅ FIX: يقبل price (→ foodPricingOverrides) و/أو stockType/stockQty/status
// (→ branchMenuItems) كل واحد يتحدث لوحده.
// =============================================
export const updateBranchMenuItem = async (req: Request, res: Response) => {
    const { id } = req.params; // branchMenuItemId

    const { price, stockType, stockQty, status } = req.body || {};
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    // 2. التأكد من وجود عنصر القائمة
    const [existingItem] = await db.select().from(branchMenuItems)
        .where(eq(branchMenuItems.id, id)).limit(1);

    if (!existingItem) throw new NotFound("Branch menu item not found");

    // 3. التأكد من صلاحية مدير الفرع
    if (userBranchId && userBranchId !== existingItem.branchId) {
        throw new BadRequest("Unauthorized: You cannot edit another branch's menu");
    }

    // 4. التأكد من تبعية الفرع للمطعم
    const [branchCheck] = await db.select().from(branches)
        .where(and(eq(branches.id, existingItem.branchId), eq(branches.restaurantId, restaurantId))).limit(1);
    if (!branchCheck) throw new NotFound("Branch not found");

    // 5. تجميع البيانات المرسلة فقط للتحديث (بدون price هنا)
    const availabilityUpdate: Partial<typeof branchMenuItems.$inferInsert> = {};

    if (stockType !== undefined) availabilityUpdate.stockType = stockType;
    if (stockQty !== undefined) availabilityUpdate.stockQty = stockQty;
    if (status !== undefined) availabilityUpdate.status = status;

    // التأكد من إرسال حقل واحد على الأقل للتحديث (price أو حاجة من الـ availability)
    if (Object.keys(availabilityUpdate).length === 0 && price === undefined) {
        throw new BadRequest("No valid fields provided for update");
    }

    // 6. تنفيذ تحديث التوفر/المخزون في branchMenuItems
    if (Object.keys(availabilityUpdate).length > 0) {
        availabilityUpdate.updatedAt = new Date();
        await db.update(branchMenuItems).set(availabilityUpdate).where(eq(branchMenuItems.id, id));
    }

    // 7. تنفيذ تحديث السعر في foodPricingOverrides (branch-only override)
    if (price !== undefined) {
        await upsertFoodPricingOverride(db, {
            foodId: existingItem.foodId,
            branchId: existingItem.branchId,
            serviceModule: null,
            price: String(price),
            status: "active",
        });
    }

    // ✅ Invalidate cache
    await invalidateBranchMenuCache(existingItem.branchId, restaurantId);

    return SuccessResponse(res, { message: "Branch menu item updated successfully" });
};


// =============================================
// ✅ FIX: بحذف الـ branchMenuItems، بنشيل معاه الـ price override الخاص
// بنفس الفرع/الصنف عشان متفضلش موجودة يتيمة وتظهر تاني لو الصنف اتضاف
// للفرع ده من تاني بسعر جديد.
// =============================================
export const deleteBranchMenuItem = async (req: Request, res: Response) => {
    const { id } = req.params; // الـ branchMenuItemId
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    // 1. التأكد إن العنصر ده موجود أصلاً
    const existingItem = await db.select().from(branchMenuItems)
        .where(eq(branchMenuItems.id, id)).limit(1);

    if (!existingItem[0]) throw new NotFound("Branch menu item not found");

    // 2. حماية الصلاحيات
    if (userBranchId && userBranchId !== existingItem[0].branchId) {
        throw new BadRequest("Unauthorized: You cannot delete another branch's menu item");
    }

    // 3. التأكد إن الفرع يخص المطعم
    const branchCheck = await db.select().from(branches)
        .where(and(eq(branches.id, existingItem[0].branchId), eq(branches.restaurantId, restaurantId))).limit(1);
    if (!branchCheck[0]) throw new NotFound("Branch not found");

    // 4. حذف العنصر من branchMenuItems
    await db.delete(branchMenuItems).where(eq(branchMenuItems.id, id));

    // 5. حذف الـ price override المرتبط بنفس الفرع/الصنف (branch-only, serviceModule NULL)
    await db.delete(foodPricingOverrides).where(and(
        eq(foodPricingOverrides.foodId, existingItem[0].foodId),
        eq(foodPricingOverrides.branchId, existingItem[0].branchId),
        isNull(foodPricingOverrides.serviceModule)
    ));

    // ✅ Invalidate cache
    await invalidateBranchMenuCache(existingItem[0].branchId, restaurantId);

    return SuccessResponse(res, { message: "Branch menu item deleted successfully" });
};

// controllers/restaurant.controller.ts
// (بدون أي تعديل — مفيهاش price خالص)

export const getRestaurantSelectData = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    const cacheKey = `admin:branch_select:${restaurantId}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        return SuccessResponse(res, { message: "Select data fetched successfully", data: JSON.parse(cachedData) });
    }

    const [myBranches, myFoods] = await Promise.all([
        db.select({
            id: branches.id,
            name: branches.name,
        })
            .from(branches)
            .where(
                and(
                    eq(branches.restaurantId, restaurantId),
                    eq(branches.status, "active")
                )
            ),

        db.select({
            id: food.id,
            name: food.name,
        })
            .from(food)
            .where(eq(food.restaurantid, restaurantId))
    ]);

    const responseData = { branches: myBranches, foods: myFoods };

    await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 1800);

    return SuccessResponse(res, {
        message: "Select data fetched successfully",
        data: responseData
    });
};


// =============================================
// تعديل بيانات الأكلة الأساسية في الكتالوج (Master Food)
// (بدون أي تعديل — مفيهاش price خالص)
// =============================================
export const updateMasterFoodItem = async (req: Request, res: Response) => {
    const { id } = req.params; // ده الـ foodId
    const { name, description, image, categoryId } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const existingFood = await db.select().from(food)
        .where(and(
            eq(food.id, id),
            eq(food.restaurantid, restaurantId)
        )).limit(1);

    if (!existingFood[0]) {
        throw new NotFound("Food item not found or you don't have permission to edit it");
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (image !== undefined) updateData.image = image;
    if (categoryId !== undefined) updateData.categoryid = categoryId;

    await db.update(food)
        .set(updateData)
        .where(eq(food.id, id));

    const branchMenuKeys = await redis.keys('admin:branch_menu:*');
    if (branchMenuKeys.length > 0) await redis.del(...branchMenuKeys);
    await redis.del(`admin:branch_select:${restaurantId}`);

    return SuccessResponse(res, { message: "Master food item updated successfully" });
};