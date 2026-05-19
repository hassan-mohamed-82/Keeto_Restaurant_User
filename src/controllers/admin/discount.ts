import { Request, Response } from "express";
import { db } from "../../models/connection";
import { discounts, discountRestaurants } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// 1. Create Discount (Auto-linked to this restaurant)
// ==========================================
export const createDiscount = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const {
        name, nameAr, nameFr,
        discountType, discountValue,
        maxDiscount, minOrderAmount,
        usageLimit, startDate, endDate, isActive
    } = req.body;

    if (!name) throw new BadRequest("Discount name is required");
    if (!discountType) throw new BadRequest("Discount type is required (percentage | fixed_amount)");
    if (discountValue === undefined || discountValue === null) throw new BadRequest("Discount value is required");

    const discountId = uuidv4();

    // 1. إدخال العرض في الجدول الرئيسي
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
        isActive: isActive !== undefined ? isActive : true,
    });

    // 2. ربطه تلقائياً وبأمان بالمطعم الحالي من التوكن
    await db.insert(discountRestaurants).values({
        id: uuidv4(),
        discountId: discountId,
        restaurantId: restaurantId
    });

    return SuccessResponse(res, { message: "Discount created successfully", data: { id: discountId } }, 201);
};

// ==========================================
// 2. Get All Discounts (For this restaurant only)
// ==========================================
export const getAllDiscounts = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // جلب الخصومات المربوطة بهذا المطعم فقط عبر الـ Join
    const rawData = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(eq(discountRestaurants.restaurantId, restaurantId));

    const allDiscounts = rawData.map(row => row.discounts);

    return SuccessResponse(res, { message: "Get all discounts success", data: allDiscounts });
};

// ==========================================
// 3. Get Discount by ID (Scoped to this restaurant)
// ==========================================
export const getDiscountById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // التحقق من وجود الخصم وأنه ينتمي لهذا المطعم
    const [rawData] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!rawData) throw new NotFound("Discount not found");

    return SuccessResponse(res, { message: "Get discount success", data: rawData.discounts });
};

// ==========================================
// 4. Update Discount (Protected)
// ==========================================
export const updateDiscount = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // تأكيد ملكية المطعم للخصم قبل التعديل
    const [existing] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Discount not found");

    const {
        name, nameAr, nameFr,
        discountType, discountValue,
        maxDiscount, minOrderAmount,
        usageLimit, startDate, endDate, isActive
    } = req.body;

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

    await db.update(discounts).set(updateData).where(eq(discounts.id, id));

    return SuccessResponse(res, { message: "Discount updated successfully" });
};

// ==========================================
// 5. Delete Discount (Protected)
// ==========================================
export const deleteDiscount = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // تأكيد ملكية المطعم للخصم قبل الحذف
    const [existing] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Discount not found");

    // الحذف من الجدول الرئيسي وسيتم مسح علاقة الربط تلقائياً بفضل الـ Cascade
    await db.delete(discounts).where(eq(discounts.id, id));

    return SuccessResponse(res, { message: "Discount deleted successfully" });
};

// ==========================================
// 6. Toggle Discount Status
// ==========================================
export const toggleDiscountStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [rawData] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!rawData) throw new NotFound("Discount not found");
    const existingDiscount = rawData.discounts;

    await db.update(discounts)
        .set({ isActive: !existingDiscount.isActive, updatedAt: new Date() })
        .where(eq(discounts.id, id));

    return SuccessResponse(res, {
        message: `Discount ${!existingDiscount.isActive ? "activated" : "deactivated"} successfully`,
        data: { isActive: !existingDiscount.isActive }
    });
};