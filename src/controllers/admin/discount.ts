import { Request, Response } from "express";
import { db } from "../../models/connection";
import { discounts, discountRestaurants } from "../../models/schema";
import { eq, and, or } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// 1. Create Discount (For this restaurant specifically)
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

    // 1. إدخال العرض في الجدول الرئيسي (مع ضبط isGlobal على false لأن المطعم هو من ينشئه لنفسه)
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
        isGlobal: false // عروض المطاعم ليست عامة تلقائياً
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
// 2. Get All Discounts (This restaurant's discounts + Global discounts)
// ==========================================
export const getAllDiscounts = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // جلب الخصومات المربوطة بهذا المطعم عبر الـ leftJoin + جلب العروض الـ Global التي تشمله
    const rawData = await db
        .selectDistinct({ discounts: discounts })
        .from(discounts)
        .leftJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            or(
                eq(discounts.isGlobal, true), // جلب العروض العامة التي تطبق على الجميع
                eq(discountRestaurants.restaurantId, restaurantId) // جلب عروض المطعم الخاصة
            )
        );

    const allDiscounts = rawData.map(row => row.discounts);

    return SuccessResponse(res, { message: "Get all discounts success", data: allDiscounts });
};

// ==========================================
// 3. Get Discount by ID (Scoped to this restaurant or Global)
// ==========================================
export const getDiscountById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // التحقق من وجود الخصم وأنه إما مخصص للمطعم أو خصم عام متاح للجميع
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

    return SuccessResponse(res, { message: "Get discount success", data: rawData.discounts });
};

// ==========================================
// 4. Update Discount (Protected - Restrict editing global discounts)
// ==========================================
export const updateDiscount = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // تأكيد ملكية المطعم للخصم، والتأكد أنه ليس خصماً عاماً (لأن المطعم لا يملك صلاحية تعديل خصومات الأدمن العامة)
    const [existing] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId),
                eq(discounts.isGlobal, false) // حماية: لمنع تعديل عروض الـ Global من قبل الـ Vendor
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Discount not found or cannot be modified");

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
// 5. Delete Discount (Protected - Restrict deleting global discounts)
// ==========================================
export const deleteDiscount = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // تأكيد ملكية المطعم للخصم وأنه ليس Global قبل الحذف
    const [existing] = await db
        .select()
        .from(discounts)
        .innerJoin(discountRestaurants, eq(discounts.id, discountRestaurants.discountId))
        .where(
            and(
                eq(discounts.id, id),
                eq(discountRestaurants.restaurantId, restaurantId),
                eq(discounts.isGlobal, false) // حماية من الحذف لعروض الأدمن العامة
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Discount not found or cannot be deleted");

    await db.delete(discounts).where(eq(discounts.id, id));

    return SuccessResponse(res, { message: "Discount deleted successfully" });
};

// ==========================================
// 6. Toggle Discount Status (Protected)
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
                eq(discountRestaurants.restaurantId, restaurantId),
                eq(discounts.isGlobal, false) // حماية لعدم تفعيل/تعطيل عروض الأدمن
            )
        )
        .limit(1);

    if (!rawData) throw new NotFound("Discount not found or cannot be modified");
    const existingDiscount = rawData.discounts;

    await db.update(discounts)
        .set({ isActive: !existingDiscount.isActive, updatedAt: new Date() })
        .where(eq(discounts.id, id));

    return SuccessResponse(res, {
        message: `Discount ${!existingDiscount.isActive ? "activated" : "deactivated"} successfully`,
        data: { isActive: !existingDiscount.isActive }
    });
};