import { Request, Response } from "express";
import { db } from "../../models/connection";
import { coupons, couponUsages, couponRestaurants } from "../../models/schema";
import { eq, and, sql, inArray, or } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";

// ========================================================
// 1. Create Coupon (Automatically linked to logged-in restaurant)
// ========================================================
export const createCoupon = async (req: Request, res: Response) => {
    // جلب الـ ID الخاص بالمطعم من توكن تسجيل الدخول تلقائياً
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const {
        code, name, nameAr, nameFr,
        discountType, discountValue,
        maxDiscount, minOrderAmount,
        usageLimit, perUserLimit,
        userUsageType,          // 'fixed' | 'unlimited'
        startDate, endDate, isActive
    } = req.body;

    if (!code) throw new BadRequest("Coupon code is required");
    if (!name) throw new BadRequest("Coupon name is required");
    if (!discountType) throw new BadRequest("Discount type is required (percentage | fixed_amount | free_delivery)");
    if (discountValue === undefined || discountValue === null) throw new BadRequest("Discount value is required");

    // Validate userUsageType
    const resolvedUserUsageType: "fixed" | "unlimited" = userUsageType === "unlimited" ? "unlimited" : "fixed";
    if (resolvedUserUsageType === "fixed" && (perUserLimit === undefined || perUserLimit === null || Number(perUserLimit) < 1)) {
        throw new BadRequest("perUserLimit is required and must be >= 1 when userUsageType is 'fixed'");
    }

    const normalizedCode = code.toUpperCase().trim();

    const conflicts = await db
        .select({ id: coupons.id })
        .from(coupons)
        .leftJoin(couponRestaurants, eq(coupons.id, couponRestaurants.couponId))
        .where(
            and(
                eq(coupons.code, normalizedCode),
                eq(coupons.isActive, true),
                or(
                    eq(coupons.isGlobal, true),
                    eq(couponRestaurants.restaurantId, restaurantId)
                )
            )
        );

    if (conflicts.length > 0) {
        throw new BadRequest("Coupon code already exists in your restaurant, please choose another");
    }
    const id = uuidv4();

    // 1. حفظ الكوبون الرئيسي في جدول الكوبونات (isGlobal = false تلقائياً للمطاعم)
    await db.insert(coupons).values({
        id,
        code: normalizedCode,
        name,
        nameAr: nameAr || null,
        nameFr: nameFr || null,
        discountType,
        discountValue: discountValue.toString(),
        maxDiscount: maxDiscount ? maxDiscount.toString() : null,
        minOrderAmount: minOrderAmount ? minOrderAmount.toString() : "0.00",
        usageLimit: usageLimit || null,
        userUsageType: resolvedUserUsageType,
        perUserLimit: resolvedUserUsageType === "unlimited" ? null : (perUserLimit ?? 1),
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isActive: isActive !== undefined ? isActive : true,
        isGlobal: false,
    });

    // 2. ربط الكوبون بالمطعم الحالي تلقائياً في جدول الربط
    await db.insert(couponRestaurants).values({
        id: uuidv4(),
        couponId: id,
        restaurantId: restaurantId,
    });

    return SuccessResponse(res, { message: "Coupon created successfully for your restaurant", data: { id } }, 201);
};

// ========================================================
// 2. Get All Coupons (Specific to this restaurant + System Globals)
// ========================================================
export const getAllCoupons = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // جلب الكوبونات الخاصة بالمطعم بالإضافة إلى أي كوبون Global نشط في السيستم
    const rawCoupons = await db
        .selectDistinct({ coupons: coupons })
        .from(coupons)
        .leftJoin(couponRestaurants, eq(coupons.id, couponRestaurants.couponId))
        .where(
            or(
                eq(couponRestaurants.restaurantId, restaurantId),
                eq(coupons.isGlobal, true)
            )
        );

    const allCoupons = rawCoupons.map(r => r.coupons);

    return SuccessResponse(res, { message: "Get all coupons success", data: allCoupons });
};

// ========================================================
// 3. Get Coupon by ID
// ========================================================
export const getCouponById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [rawCoupon] = await db
        .selectDistinct({ coupons: coupons })
        .from(coupons)
        .leftJoin(couponRestaurants, eq(coupons.id, couponRestaurants.couponId))
        .where(
            and(
                eq(coupons.id, id),
                or(
                    eq(couponRestaurants.restaurantId, restaurantId),
                    eq(coupons.isGlobal, true)
                )
            )
        )
        .limit(1);

    if (!rawCoupon) throw new NotFound("Coupon not found");

    return SuccessResponse(res, { message: "Get coupon success", data: rawCoupon.coupons });
};

// ========================================================
// 4. Update Coupon
// ========================================================
export const updateCoupon = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // التأكد أولاً أن الكوبون موجود ويخص هذا المطعم (الكوبونات الجلوبال لا يمكن للمطعم تعديلها)
    const [existing] = await db
        .selectDistinct({ coupons: coupons })
        .from(coupons)
        .innerJoin(couponRestaurants, eq(coupons.id, couponRestaurants.couponId))
        .where(and(eq(coupons.id, id), eq(couponRestaurants.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) throw new NotFound("Coupon not found or you don't have permission to edit it");

    const {
        code, name, nameAr, nameFr,
        discountType, discountValue,
        maxDiscount, minOrderAmount,
        usageLimit, perUserLimit,
        userUsageType,          // 'fixed' | 'unlimited'
        startDate, endDate, isActive
    } = req.body;

    const normalizedCode = code ? code.toUpperCase().trim() : existing.coupons.code;

    // فحص الاسم المتكرر عند تعديل الكود لمنع تضاربه داخل نفس المطعم
    if (code && normalizedCode !== existing.coupons.code) {
        const [duplicate] = await db
            .select({ id: coupons.id })
            .from(coupons)
            .innerJoin(couponRestaurants, eq(coupons.id, couponRestaurants.couponId))
            .where(
                and(
                    eq(coupons.code, normalizedCode),
                    eq(couponRestaurants.restaurantId, restaurantId)
                )
            )
            .limit(1);
        if (duplicate) throw new BadRequest("Coupon code already exists in your restaurant");
    }

    const updateData: any = { updatedAt: new Date() };

    if (code !== undefined) updateData.code = normalizedCode;
    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (nameFr !== undefined) updateData.nameFr = nameFr;
    if (discountType !== undefined) updateData.discountType = discountType;
    if (discountValue !== undefined) updateData.discountValue = discountValue.toString();
    if (maxDiscount !== undefined) updateData.maxDiscount = maxDiscount ? maxDiscount.toString() : null;
    if (minOrderAmount !== undefined) updateData.minOrderAmount = minOrderAmount.toString();
    if (usageLimit !== undefined) updateData.usageLimit = usageLimit;
    if (userUsageType !== undefined) {
        const resolvedType: "fixed" | "unlimited" = userUsageType === "unlimited" ? "unlimited" : "fixed";
        updateData.userUsageType = resolvedType;
        // If switching to fixed, require perUserLimit
        if (resolvedType === "fixed") {
            const limit = perUserLimit ?? existing.coupons.perUserLimit;
            if (!limit || Number(limit) < 1) throw new BadRequest("perUserLimit is required and must be >= 1 when userUsageType is 'fixed'");
            updateData.perUserLimit = Number(limit);
        } else {
            // unlimited — clear the per-user limit
            updateData.perUserLimit = null;
        }
    } else if (perUserLimit !== undefined) {
        updateData.perUserLimit = perUserLimit;
    }
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (isActive !== undefined) updateData.isActive = isActive;

    await db.update(coupons).set(updateData).where(eq(coupons.id, id));

    return SuccessResponse(res, { message: "Coupon updated successfully" });
};

// ========================================================
// 5. Delete Coupon
// ========================================================
export const deleteCoupon = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // التأكد أن الكوبون يخص هذا المطعم لمنع حذف كوبونات مطاعم أخرى أو كوبونات عامة
    const [existing] = await db
        .selectDistinct({ coupons: coupons })
        .from(coupons)
        .innerJoin(couponRestaurants, eq(coupons.id, couponRestaurants.couponId))
        .where(and(eq(coupons.id, id), eq(couponRestaurants.restaurantId, restaurantId)))
        .limit(1);

    if (!existing) throw new NotFound("Coupon not found or you don't have permission to delete it");

    // حذف سجلات الاستخدام المرتبطة بالكوبون أولاً
    await db.delete(couponUsages).where(eq(couponUsages.couponId, id));
    
    // حذف الكوبون نهائياً (وسيتم مسح علاقة المطعم تلقائياً بسبب CASCADE)
    await db.delete(coupons).where(eq(coupons.id, id));

    return SuccessResponse(res, { message: "Coupon deleted successfully" });
};

// ========================================================
// 6. Toggle Coupon Active Status
// ========================================================
export const toggleCouponStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    const [rawExisting] = await db
        .selectDistinct({ coupons: coupons })
        .from(coupons)
        .innerJoin(couponRestaurants, eq(coupons.id, couponRestaurants.couponId))
        .where(and(eq(coupons.id, id), eq(couponRestaurants.restaurantId, restaurantId)))
        .limit(1);

    if (!rawExisting) throw new NotFound("Coupon not found or unauthorized");
    
    const existingCoupon = rawExisting.coupons;
    const newStatus = !existingCoupon.isActive;

    await db.update(coupons)
        .set({ isActive: newStatus, updatedAt: new Date() })
        .where(eq(coupons.id, id));

    return SuccessResponse(res, {
        message: `Coupon ${newStatus ? "activated" : "deactivated"} successfully`,
        data: { isActive: newStatus }
    });
};

// // ========================================================
// // 7. Validate & Apply Coupon (Internal Function)
// // ========================================================
// export const validateCoupon = async (
//     couponCode: string,
//     userId: string,
//     restaurantId: string,
//     subtotal: number
// ): Promise<{ discountAmount: number; coupon: typeof coupons.$inferSelect }> => {
//     const now = new Date();

//     // فحص الكود: نبحث عنه إما أن يكون Global لكل السيستم أو مخصص ومربوط بالمطعم الحالي للطلب
//     const [rawCoupon] = await db
//         .selectDistinct({ coupons: coupons })
//         .from(coupons)
//         .leftJoin(couponRestaurants, eq(coupons.id, couponRestaurants.couponId))
//         .where(
//             and(
//                 eq(coupons.code, couponCode.toUpperCase().trim()),
//                 or(
//                     eq(coupons.isGlobal, true),
//                     eq(couponRestaurants.restaurantId, restaurantId)
//                 )
//             )
//         )
//         .limit(1);

//     if (!rawCoupon) throw new BadRequest("Invalid coupon code for this restaurant");
//     const coupon = rawCoupon.coupons;
    
//     if (!coupon.isActive) throw new BadRequest("This coupon is no longer active");
//     if (coupon.startDate && now < coupon.startDate) throw new BadRequest("This coupon is not yet valid");
//     if (coupon.endDate && now > coupon.endDate) throw new BadRequest("This coupon has expired");

//     const minOrder = parseFloat(coupon.minOrderAmount as string);
//     if (subtotal < minOrder)
//         throw new BadRequest(`Minimum order amount to use this coupon is ${minOrder}`);

//     if (coupon.usageLimit !== null && (coupon.usedCount ?? 0) >= coupon.usageLimit)
//         throw new BadRequest("This coupon has reached its usage limit");

//     if (coupon.perUserLimit !== null) {
//         const rows = await db
//             .select({ count: sql<number>`COUNT(*)` })
//             .from(couponUsages)
//             .where(and(
//                 eq(couponUsages.couponId, coupon.id),
//                 eq(couponUsages.userId, userId)
//             ));

//         const userUsageCount = Number(rows[0]?.count ?? 0);
//         if (userUsageCount >= coupon.perUserLimit)
//             throw new BadRequest("You have already used this coupon the maximum number of times");
//     }

//     let discountAmount = 0;

//     if (coupon.discountType === "free_delivery") {
//         discountAmount = 0;
//     } else if (coupon.discountType === "percentage") {
//         const pct = parseFloat(coupon.discountValue as string);
//         discountAmount = (subtotal * pct) / 100;
//         const maxD = coupon.maxDiscount ? parseFloat(coupon.maxDiscount as string) : null;
//         if (maxD !== null && discountAmount > maxD) discountAmount = maxD;
//     } else {
//         discountAmount = parseFloat(coupon.discountValue as string);
//         if (discountAmount > subtotal) discountAmount = subtotal;
//     }

//     return { discountAmount: parseFloat(discountAmount.toFixed(2)), coupon };
// };

// // ========================================================
// // 8. Validate Coupon Endpoint (Used by Customers App)
// // ========================================================
// export const validateCouponEndpoint = async (req: Request, res: Response) => {
//     const { code, subtotal, restaurantId } = req.body;
//     const userId = req.user?.id; 

//     if (!code) throw new BadRequest("Coupon code is required");
//     if (!subtotal) throw new BadRequest("Subtotal is required");
//     if (!restaurantId) throw new BadRequest("Restaurant ID is required");
//     if (!userId) throw new BadRequest("Unauthorized");

//     const { discountAmount, coupon } = await validateCoupon(
//         code,
//         userId,
//         restaurantId,
//         parseFloat(subtotal)
//     );

//     return SuccessResponse(res, {
//         message: "Coupon is valid",
//         data: {
//             code: coupon.code,
//             name: coupon.name,
//             discountType: coupon.discountType,
//             discountValue: coupon.discountValue,
//             discountAmount,
//         }
//     });
// };

// ========================================================
// 9. Get Coupon Usage History
// ========================================================
export const getCouponUsages = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Unauthorized");

    // التأكد من أن الكوبون يخص المطعم أو عام قبل عرض سجل الاستخدام الخاص به
    const [rawCoupon] = await db
        .selectDistinct({ coupons: coupons })
        .from(coupons)
        .leftJoin(couponRestaurants, eq(coupons.id, couponRestaurants.couponId))
        .where(
            and(
                eq(coupons.id, id),
                or(
                    eq(couponRestaurants.restaurantId, restaurantId),
                    eq(coupons.isGlobal, true)
                )
            )
        )
        .limit(1);

    if (!rawCoupon) throw new NotFound("Coupon not found");

    const usages = await db
        .select()
        .from(couponUsages)
        .where(eq(couponUsages.couponId, id));

    return SuccessResponse(res, { message: "Coupon usage history fetched", data: usages });
};