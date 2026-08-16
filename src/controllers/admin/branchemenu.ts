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
import { eq, and, sql } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import redis from "../../config/redis";

// =============================================
// Helper: مسح كاش الفرع والمطعم بعد أي تعديل
// =============================================
const invalidateBranchMenuCache = async (branchId: string, restaurantId: string) => {
    await redis.del(`admin:branch_menu:${branchId}`);
    await redis.del(`admin:branch_select:${restaurantId}`);
};

// =============================================
// تعيين أكلة لفرع معين وتحديد سعرها ومخزونها
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

    // فحص: هل الأكلة دي موجودة في الفرع ده أصلاً؟
    const existingBranchItem = await db.select().from(branchMenuItems)
        .where(and(eq(branchMenuItems.branchId, branchId), eq(branchMenuItems.foodId, foodId)))
        .limit(1);

    if (existingBranchItem[0]) {
        // لو موجودة، نعمل Update (مثلاً بيغلي السعر أو بيعدل المخزون)
        await db.update(branchMenuItems).set({
            price,
            stockType: stockType || "unlimited",
            stockQty: stockQty !== undefined ? stockQty : existingBranchItem[0].stockQty,
            status: status || existingBranchItem[0].status,
            updatedAt: new Date()
        }).where(eq(branchMenuItems.id, existingBranchItem[0].id));

        await invalidateBranchMenuCache(branchId, restaurantId);
        return SuccessResponse(res, { message: "Branch menu item updated successfully" });
    } else {
        // لو أول مرة تتضاف للفرع، نعمل Insert
        const branchItemId = uuidv4();
        await db.insert(branchMenuItems).values({
            id: branchItemId,
            branchId,
            foodId,
            price,
            stockType: stockType || "unlimited",
            stockQty: stockQty || 0,
            status: status || "active",
        });

        await invalidateBranchMenuCache(branchId, restaurantId);
        return SuccessResponse(res, { message: "Food assigned to branch successfully", data: { id: branchItemId } }, 201);
    }
};

// =============================================
// عرض منيو الفرع (دي اللي بترجع لتطبيق اليوزر)
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

        // البيانات الخاصة بالفرع باستخدام COALESCE لاعتماد الأساسي في حالة غياب الاستثناء
        price: sql<number>`COALESCE(${branchMenuItems.price}, ${food.price})`.as('price'),
        status: sql<string>`COALESCE(${branchMenuItems.status}, 'active')`.as('status'),
        stockType: sql<string>`COALESCE(${branchMenuItems.stockType}, ${food.stock_type})`.as('stock_type'),
        stockQty: sql<number>`COALESCE(${branchMenuItems.stockQty}, 0)`.as('stock_qty'),
    })
        .from(food)
        .leftJoin(branchMenuItems, and(
            eq(branchMenuItems.foodId, food.id),
            eq(branchMenuItems.branchId, branchId)
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


export const updateBranchMenuItem = async (req: Request, res: Response) => {
    const { id } = req.params; // ده الـ branchMenuItemId
    const { price, stockType, stockQty, status } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    // 1. التأكد إن العنصر ده موجود أصلاً
    const existingItem = await db.select().from(branchMenuItems)
        .where(eq(branchMenuItems.id, id)).limit(1);

    if (!existingItem[0]) throw new NotFound("Branch menu item not found");

    // 2. حماية الصلاحيات (لو مدير فرع، يتأكد إن العنصر ده في فرعه)
    if (userBranchId && userBranchId !== existingItem[0].branchId) {
        throw new BadRequest("Unauthorized: You cannot edit another branch's menu");
    }

    // 3. التأكد إن الفرع ده يخص المطعم (لزيادة الأمان)
    const branchCheck = await db.select().from(branches)
        .where(and(eq(branches.id, existingItem[0].branchId), eq(branches.restaurantId, restaurantId))).limit(1);
    if (!branchCheck[0]) throw new NotFound("Branch not found");

    // 4. تحديث البيانات
    const updateData: any = {};
    if (price !== undefined) updateData.price = price;
    if (stockType) updateData.stockType = stockType;
    if (stockQty !== undefined) updateData.stockQty = stockQty;
    if (status) updateData.status = status;
    updateData.updatedAt = new Date();

    await db.update(branchMenuItems).set(updateData).where(eq(branchMenuItems.id, id));

    // ✅ Invalidate cache
    await invalidateBranchMenuCache(existingItem[0].branchId, restaurantId);

    return SuccessResponse(res, { message: "Branch menu item updated successfully" });
};


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

    // 4. حذف العنصر
    await db.delete(branchMenuItems).where(eq(branchMenuItems.id, id));

    // ✅ Invalidate cache
    await invalidateBranchMenuCache(existingItem[0].branchId, restaurantId);

    return SuccessResponse(res, { message: "Branch menu item deleted successfully" });
};

// controllers/restaurant.controller.ts

export const getRestaurantSelectData = async (req: Request, res: Response) => {
    // بناخد الـ ID بتاع المطعم من التوكن (المالك اللي عامل Login)
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }

    // ✅ Redis Cache
    const cacheKey = `admin:branch_select:${restaurantId}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
        return SuccessResponse(res, { message: "Select data fetched successfully", data: JSON.parse(cachedData) });
    }

    // تنفيذ الـ Queries في وقت واحد لسرعة الاستجابة
    const [myBranches, myFoods] = await Promise.all([
        // 1. جلب الفروع النشطة فقط
        db.select({
            id: branches.id,
            name: branches.name,
        })
            .from(branches)
            .where(
                and(
                    eq(branches.restaurantId, restaurantId),
                    eq(branches.status, "active") // الفروع الشغالة بس
                )
            ),

        // 2. جلب قائمة الأكل (الكتالوج) بالكامل للمطعم ده
        db.select({
            id: food.id,
            name: food.name,
        })
            .from(food)
            .where(eq(food.restaurantid, restaurantId))
    ]);

    const responseData = { branches: myBranches, foods: myFoods };

    // ✅ Cache for 30 minutes
    await redis.set(cacheKey, JSON.stringify(responseData), 'EX', 1800);

    return SuccessResponse(res, {
        message: "Select data fetched successfully",
        data: responseData
    });
};


// =============================================
// تعديل بيانات الأكلة الأساسية في الكتالوج (Master Food)
// =============================================
export const updateMasterFoodItem = async (req: Request, res: Response) => {
    const { id } = req.params; // ده الـ foodId
    const { name, description, image, categoryId } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    // 1. التأكد إن الأكلة دي موجودة وتخص المطعم ده
    const existingFood = await db.select().from(food)
        .where(and(
            eq(food.id, id),
            eq(food.restaurantid, restaurantId)
        )).limit(1);

    if (!existingFood[0]) {
        throw new NotFound("Food item not found or you don't have permission to edit it");
    }

    // 2. تجهيز البيانات الجديدة للتحديث
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (image !== undefined) updateData.image = image;
    if (categoryId !== undefined) updateData.categoryid = categoryId;

    // updateData.updatedAt = new Date(); // لو عندك حقل updatedAt في جدول الـ food

    // 3. تحديث الداتابيز
    await db.update(food)
        .set(updateData)
        .where(eq(food.id, id));

    // ✅ Invalidate all branch menus that might contain this food
    const branchMenuKeys = await redis.keys('admin:branch_menu:*');
    if (branchMenuKeys.length > 0) await redis.del(...branchMenuKeys);
    await redis.del(`admin:branch_select:${restaurantId}`);

    return SuccessResponse(res, { message: "Master food item updated successfully" });
};