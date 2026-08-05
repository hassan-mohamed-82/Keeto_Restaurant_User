import { Request, Response } from "express";
import { db } from "../../models/connection";
import { discounts, discountRestaurants, discountFoods, food } from "../../models/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import { saveBase64Image } from "../../utils/handleImages";

// ==========================================
// 1. Create Discount (With Switch Logic)
// ==========================================
export const createDiscount = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const {
        name, nameAr, nameFr,
        discountType, discountValue,
        maxDiscount, minOrderAmount,
        usageLimit, startDate, endDate, isActive, foodIds, logo
    } = req.body;

    if (!name) throw new BadRequest("Discount name is required");
    if (!discountType) throw new BadRequest("Discount type is required (percentage | fixed_amount)");
    if (discountValue === undefined || discountValue === null) throw new BadRequest("Discount value is required");

    const shouldBeActive = isActive !== undefined ? isActive : true;
    const discountId = uuidv4();

    let FinalLogo = logo;
    if (logo && logo.startsWith("data:image")) {
        FinalLogo = await saveBase64Image(logo, req, "discounts");
    }

    // 💡 منطق الـ Switch: إذا كان الخصم الجديد نشطاً، نقوم بإطفاء كل الخصومات النشطة حالياً للمطعم
    if (shouldBeActive) {
        // أ) جلب الـ IDs الخاصة بخصومات هذا المطعم فقط
        const myDiscounts = await db
            .select({ id: discounts.id })
            .from(discounts)
            .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
            .where(eq(discountRestaurants.restaurantId, restaurantId));

        const myDiscountIds = myDiscounts.map(d => d.id);

        // ب) إطفاء الخصومات السابقة إن وجدت
        if (myDiscountIds.length > 0) {
            await db
                .update(discounts)
                .set({ isActive: false, updatedAt: new Date() })
                .where(and(inArray(discounts.id, myDiscountIds), eq(discounts.isActive, true)));
        }
    }

    // 1. إدخال العرض الجديد في الجدول الرئيسي
    await db.insert(discounts).values({
        id: discountId,
        name,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        discountType,
        discountValue: discountValue.toString(),
        maxDiscount: maxDiscount ? maxDiscount.toString() : null,
        minOrderAmount: minOrderAmount ? minOrderAmount.toString() : "0.00",
        usageLimit: usageLimit || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isActive: shouldBeActive,
        isGlobal: false,
        logo: FinalLogo || null
    });

    // 2. ربطه بالمطعم الحالي
    await db.insert(discountRestaurants).values({
        id: uuidv4(),
        discountId: discountId,
        restaurantId: restaurantId
    });

    // 3. إضافة المنتجات المحددة (إن وجدت)
    if (foodIds && Array.isArray(foodIds) && foodIds.length > 0) {
        const foodValues = foodIds.map((foodId: string) => ({
            id: uuidv4(),
            discountId: discountId,
            foodId: foodId
        }));
        await db.insert(discountFoods).values(foodValues);
    }

    return SuccessResponse(res, { message: "Discount created successfully. Other active discounts turned off.", data: { id: discountId } }, 201);
};

// ==========================================
// 2. Get All Discounts (This restaurant's discounts + Global discounts)
// ==========================================
export const getAllDiscounts = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const rawData = await db
        .selectDistinct({ discounts: discounts })
        .from(discounts)
        .leftJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            or(
                eq(discounts.isGlobal, true), 
                eq(discountRestaurants.restaurantId, restaurantId) 
            )
        );

    const allDiscounts = rawData.map(row => row.discounts);

    const enrichedDiscounts = await Promise.all(allDiscounts.map(async (discount) => {
        const foodsData = await db.select({
                id: food.id,
                name: food.name,
                nameAr: food.nameAr,
                nameFr: food.nameFr
            })
            .from(discountFoods)
            .innerJoin(food, eq(discountFoods.foodId, food.id))
            .where(eq(discountFoods.discountId, discount.id));
            
        return {
            ...discount,
            foodIds: foodsData.map(f => f.id),
            foods: foodsData
        };
    }));

    return SuccessResponse(res, { message: "Get all discounts success", data: enrichedDiscounts });
};

// ==========================================
// 3. Get Discount by ID
// ==========================================
export const getDiscountById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [rawData] = await db
        .selectDistinct({ discounts: discounts })
        .from(discounts)
        .leftJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                or(
                    eq(discounts.isGlobal, true),
                    eq(discountRestaurants.restaurantId, restaurantId)
                )
            )
        )
        .limit(1);

    if (!rawData) throw new NotFound("Discount not found");

    const foodsData = await db.select({
            id: food.id,
            name: food.name,
            nameAr: food.nameAr,
            nameFr: food.nameFr
        })
        .from(discountFoods)
        .innerJoin(food, eq(discountFoods.foodId, food.id))
        .where(eq(discountFoods.discountId, rawData.discounts.id));

    const result = {
        ...rawData.discounts,
        foodIds: foodsData.map(f => f.id),
        foods: foodsData
    };

    return SuccessResponse(res, { message: "Get discount success", data: result });
};

// ==========================================
// 4. Update Discount 
// ==========================================
export const updateDiscount = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId),
                eq(discounts.isGlobal, false) 
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Discount not found or cannot be modified");

    const {
        name, nameAr, nameFr,
        discountType, discountValue,
        maxDiscount, minOrderAmount,
        usageLimit, startDate, endDate, isActive, foodIds, logo
    } = req.body;

    let FinalLogo = logo;
    if (logo && logo.startsWith("data:image")) {
        FinalLogo = await saveBase64Image(logo, req, "discounts");
    }

    // 💡 أيضاً في التحديث: إذا قام بتحويل الحالة إلى active، نطفئ باقي الخصومات
    if (isActive === true && !existing.discounts.isActive) {
        const myDiscounts = await db
            .select({ id: discounts.id })
            .from(discounts)
            .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
            .where(eq(discountRestaurants.restaurantId, restaurantId));

        const myDiscountIds = myDiscounts.map(d => d.id);

        if (myDiscountIds.length > 0) {
            await db
                .update(discounts)
                .set({ isActive: false, updatedAt: new Date() })
                .where(and(inArray(discounts.id, myDiscountIds), eq(discounts.isActive, true)));
        }
    }

    const updateData: any = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (discountType !== undefined) updateData.discountType = discountType;
    if (discountValue !== undefined) updateData.discountValue = discountValue.toString();
    if (maxDiscount !== undefined) updateData.maxDiscount = maxDiscount ? maxDiscount.toString() : null;
    if (minOrderAmount !== undefined) updateData.minOrderAmount = minOrderAmount.toString();
    if (usageLimit !== undefined) updateData.usageLimit = usageLimit;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (logo !== undefined) updateData.logo = FinalLogo;

    await db.update(discounts).set(updateData).where(eq(discounts.id, id));

    if (foodIds !== undefined) {
        await db.delete(discountFoods).where(eq(discountFoods.discountId, id));
        if (Array.isArray(foodIds) && foodIds.length > 0) {
            const foodValues = foodIds.map((foodId: string) => ({
                id: uuidv4(),
                discountId: id,
                foodId: foodId
            }));
            await db.insert(discountFoods).values(foodValues);
        }
    }

    return SuccessResponse(res, { message: "Discount updated successfully" });
};

// ==========================================
// 5. Delete Discount
// ==========================================
export const deleteDiscount = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [existing] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId),
                eq(discounts.isGlobal, false) 
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Discount not found or cannot be deleted");

    await db.delete(discounts).where(eq(discounts.id, id));

    return SuccessResponse(res, { message: "Discount deleted successfully" });
};

// ==========================================
// 6. Toggle Discount Status (With Switch Logic)
// ==========================================
export const toggleDiscountStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // 1. جلب الخصم الحالي للتأكد من ملكيته للمطعم
    const [rawData] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId),
                eq(discounts.isGlobal, false) 
            )
        )
        .limit(1);

    if (!rawData) throw new NotFound("Discount not found or cannot be modified");
    const existingDiscount = rawData.discounts;
    
    // 💡 التحويل الصريح لـ Boolean (لأن MySQL أحياناً بترجع 1 أو 0)
    const currentStatus = existingDiscount.isActive === true || existingDiscount.isActive === 1 as any;
    const nextStatus = !currentStatus;

    // 2. استخدام Transaction لضمان تنفيذ العمليتين معاً بدون تداخل
    await db.transaction(async (tx) => {
        
        // 💡 إذا كان صاحب المطعم يفتح الـ Switch (يحول الحالة لـ true)
        if (nextStatus === true) {
            // أ) جلب الخصومات التابعة للمطعم (النشطة فقط)
            const activeDiscounts = await tx
                .select({ id: discounts.id })
                .from(discounts)
                .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
                .where(
                    and(
                        eq(discountRestaurants.restaurantId, restaurantId),
                        eq(discounts.isActive, true)
                    )
                );

            // ب) استخراج الـ IDs (مع استبعاد الخصم الحالي عشان منقفلوش ونرجع نفتحه في نفس اللحظة)
            const activeIdsToDeactivate = activeDiscounts
                .map(d => d.id)
                .filter(dId => dId !== id);

            // ج) إيقاف أي خصم نشط آخر
            if (activeIdsToDeactivate.length > 0) {
                await tx
                    .update(discounts)
                    .set({ isActive: false })
                    .where(inArray(discounts.id, activeIdsToDeactivate));
            }
        }

        // د) تحديث الخصم الحالي للحالة الجديدة
        await tx
            .update(discounts)
            .set({ isActive: nextStatus })
            .where(eq(discounts.id, id));
    });

    return SuccessResponse(res, {
        message: `Discount ${nextStatus ? "activated" : "deactivated"} successfully.`,
        data: { isActive: nextStatus }
    });
};