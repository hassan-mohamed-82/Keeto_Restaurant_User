import { Request, Response } from "express";
import { db } from "../../models/connection";
import { branchMenuItems, food, branches, categories } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";

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

        return SuccessResponse(res, { message: "Food assigned to branch successfully", data: { id: branchItemId } }, 201);
    }
};

// =============================================
// عرض منيو الفرع (دي اللي بترجع لتطبيق اليوزر)
// =============================================
export const getBranchMenu = async (req: Request, res: Response) => {
    const { branchId } = req.params;

    // هنجيب الداتا المتغيرة (السعر/الحالة) من جدول الفرع، وندمجها مع الداتا الثابتة من جدول الأكل
    const branchMenu = await db.select({
        menuItemId: branchMenuItems.id,
        foodId: food.id,
        name: food.name,
        description: food.description,
        image: food.image,
        categoryId: food.categoryid,
        categoryName: categories.name,
        
        // البيانات اللي بتخص الفرع ده بس:
        price: branchMenuItems.price,
        status: branchMenuItems.status,
        stockType: branchMenuItems.stockType,
        stockQty: branchMenuItems.stockQty,
    })
    .from(branchMenuItems)
    .innerJoin(food, eq(branchMenuItems.foodId, food.id)) 
    .leftJoin(categories, eq(food.categoryid, categories.id)) 
    .where(and(
        eq(branchMenuItems.branchId, branchId),
        eq(branchMenuItems.status, "active") // مفيش داعي نعرض للعميل حاجة in_active
    ));

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

    return SuccessResponse(res, { message: "Branch menu item deleted successfully" });
};


// controllers/restaurant.controller.ts

export const getRestaurantSelectData = async (req: Request, res: Response) => {
    // بناخد الـ ID بتاع المطعم من التوكن (المالك اللي عامل Login)
    const restaurantId = req.user?.restaurantId || req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
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

    return SuccessResponse(res, {
        message: "Select data fetched successfully",
        data: {
            branches: myBranches,
            foods: myFoods
        }
    });
};