"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveRedeemCode = exports.getOrderByRedeemCode = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const response_1 = require("../../utils/response");
const uuid_1 = require("uuid");
const notifications_1 = require("../../utils/notifications");
const food_helper_1 = require("../../helpers/food.helper");
const getRestaurantId = (req) => {
    const id = req.user?.restaurantId || req.user?.id;
    if (!id)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    return id;
};
// 🟢 1. جلب تفاصيل طلب الاستبدال بواسطة الـ Code (أو الـ ID) مع فحص توفر الوجبة بالفرع
const getOrderByRedeemCode = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const code = (req.params.code || req.query.code || req.params.redeemRequestId);
    const branchId = (req.query.branchId || req.user?.branchId);
    if (!code)
        throw new BadRequest_1.BadRequest("Redeem code or ID is required");
    const [request] = await connection_1.db
        .select({
        redeemRequestId: schema_1.redeemRequests.id,
        status: schema_1.redeemRequests.status,
        code: schema_1.redeemRequests.code,
        pointsDeducted: schema_1.redeemRequests.pointsDeducted,
        expiresAt: schema_1.redeemRequests.expiresAt,
        createdAt: schema_1.redeemRequests.createdAt,
        userId: schema_1.redeemRequests.userId,
        userName: schema_1.users.name,
        userPhone: schema_1.users.phone,
        foodId: schema_1.food.id,
        foodName: schema_1.food.name,
        foodImage: schema_1.food.image
    })
        .from(schema_1.redeemRequests)
        .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.redeemRequests.userId, schema_1.users.id))
        .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.redeemRequests.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.redeemRequests.restaurantId, restaurantId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.redeemRequests.code, code), (0, drizzle_orm_1.eq)(schema_1.redeemRequests.id, code))))
        .limit(1);
    if (!request) {
        throw new NotFound_1.NotFound("Redeem request not found for this restaurant");
    }
    const isExpired = new Date() > new Date(request.expiresAt);
    // فحص توفر الوجبة ومكوناتها وخياراتها بالفرع والمطعم
    const availability = await (0, food_helper_1.checkFoodAvailabilityInBranch)({
        foodId: request.foodId,
        restaurantId,
        branchId: branchId || null,
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Redeem request fetched successfully",
        data: {
            ...request,
            isExpired,
            branchId: branchId || null,
            isAvailableInBranch: availability.isAvailable,
            unavailabilityReason: availability.reason || null,
            availabilityDetails: availability.details || null,
        }
    });
};
exports.getOrderByRedeemCode = getOrderByRedeemCode;
// 🟢 2. قبول أو رفض طلب الاستبدال ومعالجة خصم النقاط وانتهاء الصلاحية
const approveRedeemCode = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { redeemRequestId, action, branchId } = req.body; // action: "approve" | "reject"
    const targetBranchId = (branchId || req.query.branchId || req.user?.branchId);
    if (!redeemRequestId)
        throw new BadRequest_1.BadRequest("redeemRequestId is required");
    if (!action || !["approve", "reject"].includes(action)) {
        throw new BadRequest_1.BadRequest("Valid action ('approve' or 'reject') is required");
    }
    const now = new Date();
    // 1. جلب بيانات طلب الاستبدال
    const [redeemReq] = await connection_1.db
        .select({
        id: schema_1.redeemRequests.id,
        userId: schema_1.redeemRequests.userId,
        restaurantId: schema_1.redeemRequests.restaurantId,
        foodId: schema_1.redeemRequests.foodId,
        code: schema_1.redeemRequests.code,
        pointsDeducted: schema_1.redeemRequests.pointsDeducted,
        status: schema_1.redeemRequests.status,
        expiresAt: schema_1.redeemRequests.expiresAt,
        foodName: schema_1.food.name,
    })
        .from(schema_1.redeemRequests)
        .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.redeemRequests.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.redeemRequests.id, redeemRequestId), (0, drizzle_orm_1.eq)(schema_1.redeemRequests.restaurantId, restaurantId)))
        .limit(1);
    if (!redeemReq) {
        throw new NotFound_1.NotFound("Redeem request not found");
    }
    if (redeemReq.status !== "pending") {
        throw new BadRequest_1.BadRequest(`Redeem request has already been processed with status: ${redeemReq.status}`);
    }
    // 🔴 فحص الكود المنتهي وتحديث حالته في قاعدة البيانات إلى expired
    if (now > new Date(redeemReq.expiresAt)) {
        await connection_1.db
            .update(schema_1.redeemRequests)
            .set({ status: "expired", updatedAt: now })
            .where((0, drizzle_orm_1.eq)(schema_1.redeemRequests.id, redeemRequestId));
        throw new BadRequest_1.BadRequest("Redeem request has expired");
    }
    // ==========================================
    // 🔴 1. حالة الرفض (REJECT)
    // ==========================================
    if (action === "reject") {
        // تحديث حالة الطلب إلى cancelled فقط (بدون إرجاع نقاط لأنه لم يتم خصمها أصلاً)
        await connection_1.db
            .update(schema_1.redeemRequests)
            .set({ status: "cancelled", updatedAt: now })
            .where((0, drizzle_orm_1.eq)(schema_1.redeemRequests.id, redeemRequestId));
        // إرسال Push Notification للعميل وللمطعم
        await (0, notifications_1.sendPushNotification)({
            recipientType: "user",
            recipientId: redeemReq.userId,
            title: "تم رفض طلب الاستبدال",
            body: `تم رفض طلب استبدال الوجبة ${redeemReq.foodName} من قبل المطعم.`,
            data: {
                type: "points_redeem_rejected",
                redeemRequestId,
                restaurantId,
            }
        });
        // await sendPushNotification({
        //     recipientType: "restaurant",
        //     recipientId: restaurantId,
        //     title: "تم رفض طلب استبدال نقاط",
        //     body: `أدخل العميل رمز الاستبدال وتم رفض الطلب للوجبة ${redeemReq.foodName}.`,
        //     data: {
        //         type: "points_redeem_rejected",
        //         redeemRequestId,
        //         restaurantId,
        //     }
        // });
        return (0, response_1.SuccessResponse)(res, {
            message: "Redeem request rejected successfully.",
            data: { redeemRequestId, status: "cancelled" }
        });
    }
    // ==========================================
    // 🟢 2. حالة القبول (APPROVE) - الخصم يتم هنا
    // ==========================================
    // التحقق من توفر الوجبة ومكوناتها وخياراتها بالفرع والمطعم قبل القبول وإنشاء الطلب
    const availability = await (0, food_helper_1.checkFoodAvailabilityInBranch)({
        foodId: redeemReq.foodId,
        restaurantId,
        branchId: targetBranchId || null,
    });
    if (!availability.isAvailable) {
        throw new BadRequest_1.BadRequest(availability.reason || "الوجبة غير متوفرة للاستبدال حالياً في هذا الفرع أو نفدت من المخزون");
    }
    const newOrderId = (0, uuid_1.v4)();
    const orderNumber = `ORD-${Date.now()}`;
    const result = await connection_1.db.transaction(async (tx) => {
        // A. التحقق من رصيد النقاط الحقيقي للعميل وخصمه
        const [userPointsRecord] = await tx
            .select()
            .from(schema_1.userRestaurantPoints)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.userId, redeemReq.userId), (0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.restaurantId, restaurantId)))
            .for("update")
            .limit(1);
        const currentBalance = userPointsRecord?.points ?? 0;
        if (currentBalance < redeemReq.pointsDeducted) {
            throw new BadRequest_1.BadRequest("أدخل العميل رمز الاستبدال ولكن لا يملك رصيد نقاط كافٍ لإتمام العملية");
        }
        const balanceAfter = currentBalance - redeemReq.pointsDeducted;
        // B. خصم النقاط من حساب المستخدم
        await tx
            .update(schema_1.userRestaurantPoints)
            .set({ points: balanceAfter, updatedAt: now })
            .where((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.id, userPointsRecord.id));
        // C. تسجيل معاملة الخصم في الجدول
        await tx.insert(schema_1.userPointsTransactions).values({
            id: (0, uuid_1.v4)(),
            userId: redeemReq.userId,
            restaurantId,
            type: "redeem",
            points: redeemReq.pointsDeducted,
            balanceBefore: currentBalance,
            balanceAfter,
            note: `Redeemed points for item: ${redeemReq.foodName}`,
            createdAt: now,
        });
        // D. حساب شيفت المطعم وتوقيت القاهرة
        const [settings] = await tx
            .select()
            .from(schema_1.restaurantSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
            .limit(1);
        const resetTimeStr = settings?.resetDailyOrderNumberTime || "00:00";
        const [resetHourRaw, resetMinuteRaw] = resetTimeStr.split(":").map(Number);
        const resetHour = isNaN(resetHourRaw) ? 0 : resetHourRaw;
        const resetMinute = isNaN(resetMinuteRaw) ? 0 : resetMinuteRaw;
        const egyptDateStr = now.toLocaleString("en-US", { timeZone: "Africa/Cairo" });
        const nowLocal = new Date(egyptDateStr);
        const startOfTodayLocal = new Date(nowLocal);
        startOfTodayLocal.setHours(resetHour, resetMinute, 0, 0);
        if (nowLocal < startOfTodayLocal) {
            startOfTodayLocal.setDate(startOfTodayLocal.getDate() - 1);
        }
        const diffMs = nowLocal.getTime() - startOfTodayLocal.getTime();
        const startOfTodayQuery = new Date(now.getTime() - diffMs);
        // E. حساب dailyOrderNumber
        const [lastOrder] = await tx
            .select({ dailyOrderNumber: schema_1.orders.dailyOrderNumber })
            .from(schema_1.orders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.gte)(schema_1.orders.createdAt, startOfTodayQuery)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.dailyOrderNumber))
            .limit(1)
            .for("update");
        const createdDailyOrderNumber = (lastOrder?.dailyOrderNumber || 0) + 1;
        // F. إنشاء الطلب في جدول orders
        await tx.insert(schema_1.orders).values({
            id: newOrderId,
            orderNumber,
            userId: redeemReq.userId,
            restaurantId,
            orderSource: "online_order_app",
            paymentMethod: null,
            orderType: "takeaway",
            branchId: targetBranchId || null,
            subtotal: "0.00",
            deliveryFee: "0.00",
            serviceFee: "0.00",
            appCommission: "0.00",
            discountAmount: "0.00",
            totalAmount: "0.00",
            status: "preparing",
            isPointsRedeemed: true,
            redeemCode: redeemReq.code,
            redeemCodeExpiresAt: redeemReq.expiresAt,
            dailyOrderNumber: createdDailyOrderNumber,
            createdAt: now,
            updatedAt: now,
        });
        // G. إدراج عنصر الطلب في orderItems
        await tx.insert(schema_1.orderItems).values({
            id: (0, uuid_1.v4)(),
            orderId: newOrderId,
            foodId: redeemReq.foodId,
            quantity: 1,
            basePrice: "0.00",
            variationsPrice: "0.00",
            totalPrice: "0.00",
        });
        // H. تحديث حالة طلب الاستبدال إلى used
        await tx
            .update(schema_1.redeemRequests)
            .set({ status: "used", updatedAt: now })
            .where((0, drizzle_orm_1.eq)(schema_1.redeemRequests.id, redeemRequestId));
        return {
            orderId: newOrderId,
            dailyOrderNumber: createdDailyOrderNumber,
            orderNumber,
            deductedPoints: redeemReq.pointsDeducted,
            newBalance: balanceAfter
        };
    });
    // 🟢 I. إرسال Push Notification للعميل وللمطعم عبر FCM
    await (0, notifications_1.sendPushNotification)({
        recipientType: "user",
        recipientId: redeemReq.userId,
        title: "تم قبول طلب الاستبدال!",
        body: `أدخل العميل رمز الاستبدال وتم قبوله! تم خصم ${result.deductedPoints} نقطة. طلبك للوجبة ${redeemReq.foodName} قيد التحضير برقم #${result.dailyOrderNumber}`,
        data: {
            type: "points_redeem_approved",
            redeemRequestId,
            orderId: result.orderId,
            dailyOrderNumber: result.dailyOrderNumber,
            restaurantId,
        }
    });
    await (0, notifications_1.sendPushNotification)({
        recipientType: "restaurant",
        recipientId: restaurantId,
        title: "تم قبول طلب استبدال نقاط",
        body: `تم إدراج طلب استبدال نقاط للوجبة ${redeemReq.foodName} برقم يومي #${result.dailyOrderNumber}`,
        data: {
            type: "points_redeem_approved",
            orderId: result.orderId,
            dailyOrderNumber: result.dailyOrderNumber,
            restaurantId,
        }
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Redeem request approved, points deducted, and order created successfully.",
        data: {
            redeemRequestId,
            status: "approved",
            order: {
                orderId: result.orderId,
                dailyOrderNumber: result.dailyOrderNumber,
                orderNumber: result.orderNumber,
            },
        }
    });
};
exports.approveRedeemCode = approveRedeemCode;
