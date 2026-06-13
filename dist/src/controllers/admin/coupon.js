"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCouponUsages = exports.toggleCouponStatus = exports.deleteCoupon = exports.updateCoupon = exports.getCouponById = exports.getAllCoupons = exports.createCoupon = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
// ========================================================
// 1. Create Coupon (Automatically linked to logged-in restaurant)
// ========================================================
const createCoupon = async (req, res) => {
    // جلب الـ ID الخاص بالمطعم من توكن تسجيل الدخول تلقائياً
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const { code, name, nameAr, nameFr, discountType, discountValue, maxDiscount, minOrderAmount, usageLimit, perUserLimit, startDate, endDate, isActive } = req.body;
    if (!code)
        throw new BadRequest_1.BadRequest("Coupon code is required");
    if (!name)
        throw new BadRequest_1.BadRequest("Coupon name is required");
    if (!discountType)
        throw new BadRequest_1.BadRequest("Discount type is required (percentage | fixed_amount | free_delivery)");
    if (discountValue === undefined || discountValue === null)
        throw new BadRequest_1.BadRequest("Discount value is required");
    const normalizedCode = code.toUpperCase().trim();
    const conflicts = await connection_1.db
        .select({ id: schema_1.coupons.id })
        .from(schema_1.coupons)
        .leftJoin(schema_1.couponRestaurants, (0, drizzle_orm_1.eq)(schema_1.coupons.id, schema_1.couponRestaurants.couponId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coupons.code, normalizedCode), (0, drizzle_orm_1.eq)(schema_1.coupons.isActive, true), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.coupons.isGlobal, true), (0, drizzle_orm_1.eq)(schema_1.couponRestaurants.restaurantId, restaurantId))));
    if (conflicts.length > 0) {
        throw new BadRequest_1.BadRequest("Coupon code already exists in your restaurant, please choose another");
    }
    const id = (0, uuid_1.v4)();
    // 1. حفظ الكوبون الرئيسي في جدول الكوبونات (isGlobal = false تلقائياً للمطاعم)
    await connection_1.db.insert(schema_1.coupons).values({
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
        perUserLimit: perUserLimit !== undefined ? perUserLimit : 1,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        isActive: isActive !== undefined ? isActive : true,
        isGlobal: false,
    });
    // 2. ربط الكوبون بالمطعم الحالي تلقائياً في جدول الربط
    await connection_1.db.insert(schema_1.couponRestaurants).values({
        id: (0, uuid_1.v4)(),
        couponId: id,
        restaurantId: restaurantId,
    });
    return (0, response_1.SuccessResponse)(res, { message: "Coupon created successfully for your restaurant", data: { id } }, 201);
};
exports.createCoupon = createCoupon;
// ========================================================
// 2. Get All Coupons (Specific to this restaurant + System Globals)
// ========================================================
const getAllCoupons = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // جلب الكوبونات الخاصة بالمطعم بالإضافة إلى أي كوبون Global نشط في السيستم
    const rawCoupons = await connection_1.db
        .selectDistinct({ coupons: schema_1.coupons })
        .from(schema_1.coupons)
        .leftJoin(schema_1.couponRestaurants, (0, drizzle_orm_1.eq)(schema_1.coupons.id, schema_1.couponRestaurants.couponId))
        .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.couponRestaurants.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.coupons.isGlobal, true)));
    const allCoupons = rawCoupons.map(r => r.coupons);
    return (0, response_1.SuccessResponse)(res, { message: "Get all coupons success", data: allCoupons });
};
exports.getAllCoupons = getAllCoupons;
// ========================================================
// 3. Get Coupon by ID
// ========================================================
const getCouponById = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [rawCoupon] = await connection_1.db
        .selectDistinct({ coupons: schema_1.coupons })
        .from(schema_1.coupons)
        .leftJoin(schema_1.couponRestaurants, (0, drizzle_orm_1.eq)(schema_1.coupons.id, schema_1.couponRestaurants.couponId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coupons.id, id), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.couponRestaurants.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.coupons.isGlobal, true))))
        .limit(1);
    if (!rawCoupon)
        throw new NotFound_1.NotFound("Coupon not found");
    return (0, response_1.SuccessResponse)(res, { message: "Get coupon success", data: rawCoupon.coupons });
};
exports.getCouponById = getCouponById;
// ========================================================
// 4. Update Coupon
// ========================================================
const updateCoupon = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // التأكد أولاً أن الكوبون موجود ويخص هذا المطعم (الكوبونات الجلوبال لا يمكن للمطعم تعديلها)
    const [existing] = await connection_1.db
        .selectDistinct({ coupons: schema_1.coupons })
        .from(schema_1.coupons)
        .innerJoin(schema_1.couponRestaurants, (0, drizzle_orm_1.eq)(schema_1.coupons.id, schema_1.couponRestaurants.couponId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coupons.id, id), (0, drizzle_orm_1.eq)(schema_1.couponRestaurants.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Coupon not found or you don't have permission to edit it");
    const { code, name, nameAr, nameFr, discountType, discountValue, maxDiscount, minOrderAmount, usageLimit, perUserLimit, startDate, endDate, isActive } = req.body;
    const normalizedCode = code ? code.toUpperCase().trim() : existing.coupons.code;
    // فحص الاسم المتكرر عند تعديل الكود لمنع تضاربه داخل نفس المطعم
    if (code && normalizedCode !== existing.coupons.code) {
        const [duplicate] = await connection_1.db
            .select({ id: schema_1.coupons.id })
            .from(schema_1.coupons)
            .innerJoin(schema_1.couponRestaurants, (0, drizzle_orm_1.eq)(schema_1.coupons.id, schema_1.couponRestaurants.couponId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coupons.code, normalizedCode), (0, drizzle_orm_1.eq)(schema_1.couponRestaurants.restaurantId, restaurantId)))
            .limit(1);
        if (duplicate)
            throw new BadRequest_1.BadRequest("Coupon code already exists in your restaurant");
    }
    const updateData = { updatedAt: new Date() };
    if (code !== undefined)
        updateData.code = normalizedCode;
    if (name !== undefined)
        updateData.name = name;
    if (nameAr !== undefined)
        updateData.nameAr = nameAr;
    if (nameFr !== undefined)
        updateData.nameFr = nameFr;
    if (discountType !== undefined)
        updateData.discountType = discountType;
    if (discountValue !== undefined)
        updateData.discountValue = discountValue.toString();
    if (maxDiscount !== undefined)
        updateData.maxDiscount = maxDiscount ? maxDiscount.toString() : null;
    if (minOrderAmount !== undefined)
        updateData.minOrderAmount = minOrderAmount.toString();
    if (usageLimit !== undefined)
        updateData.usageLimit = usageLimit;
    if (perUserLimit !== undefined)
        updateData.perUserLimit = perUserLimit;
    if (startDate !== undefined)
        updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined)
        updateData.endDate = endDate ? new Date(endDate) : null;
    if (isActive !== undefined)
        updateData.isActive = isActive;
    await connection_1.db.update(schema_1.coupons).set(updateData).where((0, drizzle_orm_1.eq)(schema_1.coupons.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Coupon updated successfully" });
};
exports.updateCoupon = updateCoupon;
// ========================================================
// 5. Delete Coupon
// ========================================================
const deleteCoupon = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // التأكد أن الكوبون يخص هذا المطعم لمنع حذف كوبونات مطاعم أخرى أو كوبونات عامة
    const [existing] = await connection_1.db
        .selectDistinct({ coupons: schema_1.coupons })
        .from(schema_1.coupons)
        .innerJoin(schema_1.couponRestaurants, (0, drizzle_orm_1.eq)(schema_1.coupons.id, schema_1.couponRestaurants.couponId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coupons.id, id), (0, drizzle_orm_1.eq)(schema_1.couponRestaurants.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Coupon not found or you don't have permission to delete it");
    // حذف سجلات الاستخدام المرتبطة بالكوبون أولاً
    await connection_1.db.delete(schema_1.couponUsages).where((0, drizzle_orm_1.eq)(schema_1.couponUsages.couponId, id));
    // حذف الكوبون نهائياً (وسيتم مسح علاقة المطعم تلقائياً بسبب CASCADE)
    await connection_1.db.delete(schema_1.coupons).where((0, drizzle_orm_1.eq)(schema_1.coupons.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Coupon deleted successfully" });
};
exports.deleteCoupon = deleteCoupon;
// ========================================================
// 6. Toggle Coupon Active Status
// ========================================================
const toggleCouponStatus = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    const [rawExisting] = await connection_1.db
        .selectDistinct({ coupons: schema_1.coupons })
        .from(schema_1.coupons)
        .innerJoin(schema_1.couponRestaurants, (0, drizzle_orm_1.eq)(schema_1.coupons.id, schema_1.couponRestaurants.couponId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coupons.id, id), (0, drizzle_orm_1.eq)(schema_1.couponRestaurants.restaurantId, restaurantId)))
        .limit(1);
    if (!rawExisting)
        throw new NotFound_1.NotFound("Coupon not found or unauthorized");
    const existingCoupon = rawExisting.coupons;
    const newStatus = !existingCoupon.isActive;
    await connection_1.db.update(schema_1.coupons)
        .set({ isActive: newStatus, updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.coupons.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: `Coupon ${newStatus ? "activated" : "deactivated"} successfully`,
        data: { isActive: newStatus }
    });
};
exports.toggleCouponStatus = toggleCouponStatus;
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
const getCouponUsages = async (req, res) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Unauthorized");
    // التأكد من أن الكوبون يخص المطعم أو عام قبل عرض سجل الاستخدام الخاص به
    const [rawCoupon] = await connection_1.db
        .selectDistinct({ coupons: schema_1.coupons })
        .from(schema_1.coupons)
        .leftJoin(schema_1.couponRestaurants, (0, drizzle_orm_1.eq)(schema_1.coupons.id, schema_1.couponRestaurants.couponId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.coupons.id, id), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.couponRestaurants.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.coupons.isGlobal, true))))
        .limit(1);
    if (!rawCoupon)
        throw new NotFound_1.NotFound("Coupon not found");
    const usages = await connection_1.db
        .select()
        .from(schema_1.couponUsages)
        .where((0, drizzle_orm_1.eq)(schema_1.couponUsages.couponId, id));
    return (0, response_1.SuccessResponse)(res, { message: "Coupon usage history fetched", data: usages });
};
exports.getCouponUsages = getCouponUsages;
