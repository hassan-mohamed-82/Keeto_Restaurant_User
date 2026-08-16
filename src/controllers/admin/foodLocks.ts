import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    food,
    branches,
    branchIngredientLocks,
    foodIngredients,
    ingredients,
    branchMenuItems,
} from "../../models/schema";
import { eq, and, ne } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import redis from "../../config/redis";

// =============================================
// Toggle قفل منتج في فرع معين
// PATCH /:branchId/food/:foodId/lock
// =============================================
export const toggleBranchFoodLock = async (req: Request, res: Response) => {
    const { branchId, foodId } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    // حماية الصلاحيات
    if (userBranchId && userBranchId !== branchId) {
        throw new BadRequest("Unauthorized: You cannot edit another branch's data");
    }

    // التأكد إن الفرع يخص المطعم
    const branchCheck = await db.select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId)))
        .limit(1);
    if (!branchCheck[0]) throw new NotFound("Branch not found or does not belong to your restaurant");

    // التأكد إن الأكلة دي موجودة فعلاً في الكتالوج
    const foodCheck = await db.select({ id: food.id })
        .from(food)
        .where(and(eq(food.id, foodId), eq(food.restaurantid, restaurantId)))
        .limit(1);
    if (!foodCheck[0]) throw new NotFound("Food item not found in master catalog");

    // جلب السجل الحالي في branchMenuItems إن وجد
    const existing = await db.select()
        .from(branchMenuItems)
        .where(and(
            eq(branchMenuItems.branchId, branchId),
            eq(branchMenuItems.foodId, foodId)
        ))
        .limit(1);

    let newStatus: string;

    if (existing[0]) {
        newStatus = existing[0].status === "active" ? "inactive" : "active";
        await db.update(branchMenuItems)
            .set({ status: newStatus as any, updatedAt: new Date() })
            .where(eq(branchMenuItems.id, existing[0].id));
    } else {
        // إذا لم تكن موجودة، فهي افتراضيا نشطة، وسنقوم بقفلها
        newStatus = "inactive";
        await db.insert(branchMenuItems).values({
            id: uuidv4(),
            branchId,
            foodId,
            status: newStatus as any,
        });
    }

    // مسح كاش منيو الفرع اللي بيتحسب ديناميكياً
    await redis.del(`admin:branch_menu:${branchId}`);
    // Also clear user facing cache if exists
    const userCacheKey = `restaurant_details:${restaurantId}:branch:${branchId}`;
    await redis.del(userCacheKey);

    return SuccessResponse(res, {
        message: `Food "${foodId}" is now ${newStatus} in branch "${branchId}"`,
        data: { status: newStatus }
    });
};


// =============================================
// Toggle قفل ingredient لمنتج (سواء globally أو في فرع معين)
// PATCH /food/:foodId/ingredient/:ingredientId/lock
// Body: { branchId?: string }
// =============================================
export const toggleIngredientLock = async (req: Request, res: Response) => {
    const { foodId, ingredientId } = req.params;
    const { branchId } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const userBranchId = req.user?.branchId;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    if (branchId) {
        // حماية الصلاحيات
        if (userBranchId && userBranchId !== branchId) {
            throw new BadRequest("Unauthorized: You cannot edit another branch's data");
        }

        // التأكد إن الفرع يخص المطعم
        const branchCheck = await db.select({ id: branches.id })
            .from(branches)
            .where(and(eq(branches.id, branchId), eq(branches.restaurantId, restaurantId)))
            .limit(1);
        if (!branchCheck[0]) throw new NotFound("Branch not found or does not belong to your restaurant");

        // التأكد إن الـ ingredient مرتبط بالأكلة دي فعلاً
        const linkCheck = await db.select({ id: foodIngredients.id })
            .from(foodIngredients)
            .where(and(
                eq(foodIngredients.foodId, foodId),
                eq(foodIngredients.ingredientId, ingredientId)
            ))
            .limit(1);
        if (!linkCheck[0]) throw new NotFound("This ingredient is not linked to this food item");

        // جلب السجل الحالي إن وجد
        const existing = await db.select()
            .from(branchIngredientLocks)
            .where(and(
                eq(branchIngredientLocks.branchId, branchId),
                eq(branchIngredientLocks.foodId, foodId),
                eq(branchIngredientLocks.ingredientId, ingredientId)
            ))
            .limit(1);

        let newIsAvailable: boolean;

        if (existing[0]) {
            newIsAvailable = !existing[0].isAvailable;
            await db.update(branchIngredientLocks)
                .set({ isAvailable: newIsAvailable, updatedAt: new Date() })
                .where(eq(branchIngredientLocks.id, existing[0].id));
        } else {
            newIsAvailable = false; // Default toggled state is false (locked)
            await db.insert(branchIngredientLocks).values({
                id: uuidv4(),
                branchId,
                foodId,
                ingredientId,
                isAvailable: false,
            });
        }

        // مسح كاش منيو الفرع اللي بيتحسب ديناميكياً
        await redis.del(`admin:branch_menu:${branchId}`);
        // Also clear user facing cache if exists
        const userCacheKey = `restaurant_details:${restaurantId}:branch:${branchId}`;
        await redis.del(userCacheKey);

        return SuccessResponse(res, {
            message: `Ingredient is now ${newIsAvailable ? 'available' : 'unavailable'} for food "${foodId}" in branch "${branchId}"`,
            data: { isAvailable: newIsAvailable }
        });
    } else {
        // التأكد إن الأكلة تخص المطعم
        const foodCheck = await db.select({ id: food.id, isOutOfStock: food.isOutOfStock })
            .from(food)
            .where(and(eq(food.id, foodId), eq(food.restaurantid, restaurantId)))
            .limit(1);
        if (!foodCheck[0]) throw new NotFound("Food not found or does not belong to your restaurant");

        // التأكد إن الـ ingredient مرتبط بالأكلة
        const linkCheck = await db.select({ id: foodIngredients.id })
            .from(foodIngredients)
            .where(and(
                eq(foodIngredients.foodId, foodId),
                eq(foodIngredients.ingredientId, ingredientId)
            ))
            .limit(1);
        if (!linkCheck[0]) throw new NotFound("This ingredient is not linked to this food item");

        // جلب الحالة الحالية للـ ingredient
        const ingredientCheck = await db.select({ id: ingredients.id, inStock: ingredients.inStock })
            .from(ingredients)
            .where(and(
                eq(ingredients.id, ingredientId),
                eq(ingredients.restaurantId, restaurantId)
            ))
            .limit(1);
        if (!ingredientCheck[0]) throw new NotFound("Ingredient not found");

        // Toggle حالة المكون
        const newInStock = !ingredientCheck[0].inStock;
        await db.update(ingredients)
            .set({ inStock: newInStock, updatedAt: new Date() })
            .where(eq(ingredients.id, ingredientId));

        // تحديث food.isOutOfStock بناءً على حالة كل المكونات
        if (!newInStock) {
            // ingredient أصبح out of stock → المنتج out of stock
            await db.update(food)
                .set({ isOutOfStock: true })
                .where(eq(food.id, foodId));
        } else {
            // ingredient أصبح in stock → نتحقق هل كل المكونات الأخرى in stock
            const allIngredients = await db.select({
                id: ingredients.id,
                inStock: ingredients.inStock
            })
                .from(ingredients)
                .innerJoin(foodIngredients, and(
                    eq(foodIngredients.ingredientId, ingredients.id),
                    eq(foodIngredients.foodId, foodId)
                ));

            const allInStock = allIngredients.every(ing => ing.inStock === true);

            if (allInStock) {
                // كل المكونات متاحة → المنتج متاح
                await db.update(food)
                    .set({ isOutOfStock: false })
                    .where(eq(food.id, foodId));
            }
        }

        // مسح كاش الهوم
        const homeMenuKeys = await redis.keys('restaurant_details:*');
        if (homeMenuKeys.length > 0) await redis.del(...homeMenuKeys);
        const categoryKeys = await redis.keys('foods_category:*');
        if (categoryKeys.length > 0) await redis.del(...categoryKeys);

        return SuccessResponse(res, {
            message: `Ingredient is now ${newInStock ? 'in stock' : 'out of stock'} globally. Food "${foodId}" isOutOfStock = ${!newInStock}`,
            data: {
                ingredientInStock: newInStock,
                foodIsOutOfStock: !newInStock
            }
        });
    }
};


// =============================================
// جلب حالة قفل منتج أو مكون في جميع فروع المطعم
// GET /availability?foodId=...&ingredientId=...
// =============================================
export const getBranchAvailability = async (req: Request, res: Response) => {
    const { foodId, ingredientId } = req.query as { foodId?: string, ingredientId?: string };
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) throw new BadRequest("Restaurant ID missing");
    if (!foodId && !ingredientId) throw new BadRequest("Must provide foodId or ingredientId");

    // جلب جميع الفروع النشطة التابعة للمطعم
    const allBranches = await db.select({
        id: branches.id,
        name: branches.name,
        nameAr: branches.nameAr,
    })
    .from(branches)
    .where(and(eq(branches.restaurantId, restaurantId), eq(branches.status, 'active')));

    let result: any[] = [];

    if (ingredientId && foodId) {
        // فحص حالة قفل المكون لمنتج معين
        const locks = await db.select()
            .from(branchIngredientLocks)
            .where(and(
                eq(branchIngredientLocks.foodId, foodId),
                eq(branchIngredientLocks.ingredientId, ingredientId)
            ));
            
        const lockMap = new Map(locks.map(l => [l.branchId, l.isAvailable]));
        
        result = allBranches.map(b => ({
            branchId: b.id,
            branchName: b.name,
            branchNameAr: b.nameAr,
            // لو مفيش قفل صريح، يبقى متاح (true)
            isAvailable: lockMap.has(b.id) ? lockMap.get(b.id) : true
        }));
    } else if (foodId) {
        // فحص حالة قفل المنتج ككل
        const menuItems = await db.select()
            .from(branchMenuItems)
            .where(eq(branchMenuItems.foodId, foodId));
            
        const statusMap = new Map(menuItems.map(m => [m.branchId, m.status]));
        
        result = allBranches.map(b => ({
            branchId: b.id,
            branchName: b.name,
            branchNameAr: b.nameAr,
            // لو مفيش سجل، يبقى متاح (active)
            isAvailable: statusMap.has(b.id) ? statusMap.get(b.id) === 'active' : true
        }));
    } else if (ingredientId) {
        // فحص حالة قفل المكون بشكل عام (في حال كان foodId غير موجود)
        // بنفترض إنك بتبحث عن القفل الخاص بالمكون ككل على مستوى الفرع (foodId is null)
        const locks = await db.select()
            .from(branchIngredientLocks)
            .where(and(
                eq(branchIngredientLocks.ingredientId, ingredientId),
                // نفترض إن foodId null يعني قفل لكل الوجبات في الفرع
                // إذا لم يكن كذلك، يمكنك إزالة هذا الشرط
            ));
            
        // فلترة السجلات اللي ملهاش foodId فقط أو حسب البزنس لوجيك
        const generalLocks = locks.filter(l => !l.foodId);
        const lockMap = new Map(generalLocks.map(l => [l.branchId, l.isAvailable]));
        
        result = allBranches.map(b => ({
            branchId: b.id,
            branchName: b.name,
            branchNameAr: b.nameAr,
            isAvailable: lockMap.has(b.id) ? lockMap.get(b.id) : true
        }));
    }

    return SuccessResponse(res, {
        message: "Branch availability fetched successfully",
        data: result
    });
};
