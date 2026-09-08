import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    redeemRequests,
    orders,
    orderItems,
    food,
    users,
    userRestaurantPoints,
    userPointsTransactions,
    restaurantSettings
} from "../../models/schema";
import { eq, and, gte, desc, or } from "drizzle-orm";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { SuccessResponse } from "../../utils/response";
import { v4 as uuidv4 } from "uuid";
import { sendPushNotification } from "../../utils/notifications";
import { checkFoodAvailabilityInBranch } from "../../helpers/food.helper";

const getRestaurantId = (req: Request): string => {
    const id = req.user?.restaurantId || req.user?.id;
    if (!id) throw new BadRequest("Restaurant ID missing or unauthorized");
    return id;
};

// 🟢 1. جلب تفاصيل طلب الاستبدال بواسطة الـ Code (أو الـ ID) مع فحص توفر الوجبة بالفرع
export const getOrderByRedeemCode = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const code = (req.params.code || req.query.code || req.params.redeemRequestId) as string;
    const branchId = (req.query.branchId || req.user?.branchId) as string | undefined;

    if (!code) throw new BadRequest("Redeem code or ID is required");

    const [request] = await db
        .select({
            redeemRequestId: redeemRequests.id,
            status: redeemRequests.status,
            code: redeemRequests.code,
            pointsDeducted: redeemRequests.pointsDeducted,
            expiresAt: redeemRequests.expiresAt,
            createdAt: redeemRequests.createdAt,
            userId: redeemRequests.userId,
            userName: users.name,
            userPhone: users.phone,
            foodId: food.id,
            foodName: food.name,
            foodImage: food.image
        })
        .from(redeemRequests)
        .innerJoin(users, eq(redeemRequests.userId, users.id))
        .innerJoin(food, eq(redeemRequests.foodId, food.id))
        .where(
            and(
                eq(redeemRequests.restaurantId, restaurantId),
                or(
                    eq(redeemRequests.code, code),
                    eq(redeemRequests.id, code)
                )
            )
        )
        .limit(1);

    if (!request) {
        throw new NotFound("Redeem request not found for this restaurant");
    }

    const isExpired = new Date() > new Date(request.expiresAt);

    // فحص توفر الوجبة ومكوناتها وخياراتها بالفرع والمطعم
    const availability = await checkFoodAvailabilityInBranch({
        foodId: request.foodId,
        restaurantId,
        branchId: branchId || null,
    });

    return SuccessResponse(res, {
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

// 🟢 2. قبول أو رفض طلب الاستبدال ومعالجة خصم النقاط وانتهاء الصلاحية
export const approveRedeemCode = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { redeemRequestId, action, branchId } = req.body; // action: "approve" | "reject"
    const targetBranchId = (branchId || req.query.branchId || req.user?.branchId) as string | undefined;

    if (!redeemRequestId) throw new BadRequest("redeemRequestId is required");
    if (!action || !["approve", "reject"].includes(action)) {
        throw new BadRequest("Valid action ('approve' or 'reject') is required");
    }

    const now = new Date();

    // 1. جلب بيانات طلب الاستبدال
    const [redeemReq] = await db
        .select({
            id: redeemRequests.id,
            userId: redeemRequests.userId,
            restaurantId: redeemRequests.restaurantId,
            foodId: redeemRequests.foodId,
            code: redeemRequests.code,
            pointsDeducted: redeemRequests.pointsDeducted,
            status: redeemRequests.status,
            expiresAt: redeemRequests.expiresAt,
            foodName: food.name,
        })
        .from(redeemRequests)
        .innerJoin(food, eq(redeemRequests.foodId, food.id))
        .where(
            and(
                eq(redeemRequests.id, redeemRequestId),
                eq(redeemRequests.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!redeemReq) {
        throw new NotFound("Redeem request not found");
    }

    if (redeemReq.status !== "pending") {
        throw new BadRequest(`Redeem request has already been processed with status: ${redeemReq.status}`);
    }

    // 🔴 فحص الكود المنتهي وتحديث حالته في قاعدة البيانات إلى expired
    if (now > new Date(redeemReq.expiresAt)) {
        await db
            .update(redeemRequests)
            .set({ status: "expired", updatedAt: now })
            .where(eq(redeemRequests.id, redeemRequestId));

        throw new BadRequest("Redeem request has expired");
    }

    // ==========================================
    // 🔴 1. حالة الرفض (REJECT)
    // ==========================================
    if (action === "reject") {
        // تحديث حالة الطلب إلى cancelled فقط (بدون إرجاع نقاط لأنه لم يتم خصمها أصلاً)
        await db
            .update(redeemRequests)
            .set({ status: "cancelled", updatedAt: now })
            .where(eq(redeemRequests.id, redeemRequestId));

        // إرسال Push Notification للعميل وللمطعم
        await sendPushNotification({
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

        await sendPushNotification({
            recipientType: "restaurant",
            recipientId: restaurantId,
            title: "تم رفض طلب استبدال نقاط",
            body: `أدخل العميل رمز الاستبدال وتم رفض الطلب للوجبة ${redeemReq.foodName}.`,
            data: {
                type: "points_redeem_rejected",
                redeemRequestId,
                restaurantId,
            }
        });

        return SuccessResponse(res, {
            message: "Redeem request rejected successfully.",
            data: { redeemRequestId, status: "cancelled" }
        });
    }

    // ==========================================
    // 🟢 2. حالة القبول (APPROVE) - الخصم يتم هنا
    // ==========================================
    // التحقق من توفر الوجبة ومكوناتها وخياراتها بالفرع والمطعم قبل القبول وإنشاء الطلب
    const availability = await checkFoodAvailabilityInBranch({
        foodId: redeemReq.foodId,
        restaurantId,
        branchId: targetBranchId || null,
    });

    if (!availability.isAvailable) {
        throw new BadRequest(
            availability.reason || "الوجبة غير متوفرة للاستبدال حالياً في هذا الفرع أو نفدت من المخزون"
        );
    }

    const newOrderId = uuidv4();
    const orderNumber = `ORD-${Date.now()}`;

    const result = await db.transaction(async (tx) => {
        // A. التحقق من رصيد النقاط الحقيقي للعميل وخصمه
        const [userPointsRecord] = await tx
            .select()
            .from(userRestaurantPoints)
            .where(
                and(
                    eq(userRestaurantPoints.userId, redeemReq.userId),
                    eq(userRestaurantPoints.restaurantId, restaurantId)
                )
            )
            .for("update")
            .limit(1);

        const currentBalance = userPointsRecord?.points ?? 0;

        if (currentBalance < redeemReq.pointsDeducted) {
            throw new BadRequest("أدخل العميل رمز الاستبدال ولكن لا يملك رصيد نقاط كافٍ لإتمام العملية");
        }

        const balanceAfter = currentBalance - redeemReq.pointsDeducted;

        // B. خصم النقاط من حساب المستخدم
        await tx
            .update(userRestaurantPoints)
            .set({ points: balanceAfter, updatedAt: now })
            .where(eq(userRestaurantPoints.id, userPointsRecord.id));

        // C. تسجيل معاملة الخصم في الجدول
        await tx.insert(userPointsTransactions).values({
            id: uuidv4(),
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
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, restaurantId))
            .limit(1);

        const resetTimeStr = (settings as any)?.resetDailyOrderNumberTime || "00:00";
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
            .select({ dailyOrderNumber: orders.dailyOrderNumber })
            .from(orders)
            .where(
                and(
                    eq(orders.restaurantId, restaurantId),
                    gte(orders.createdAt, startOfTodayQuery)
                )
            )
            .orderBy(desc(orders.dailyOrderNumber))
            .limit(1)
            .for("update");

        const createdDailyOrderNumber = (lastOrder?.dailyOrderNumber || 0) + 1;

        // F. إنشاء الطلب في جدول orders
        await tx.insert(orders).values({
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
        await tx.insert(orderItems).values({
            id: uuidv4(),
            orderId: newOrderId,
            foodId: redeemReq.foodId,
            quantity: 1,
            basePrice: "0.00",
            variationsPrice: "0.00",
            totalPrice: "0.00",
        });

        // H. تحديث حالة طلب الاستبدال إلى used
        await tx
            .update(redeemRequests)
            .set({ status: "used", updatedAt: now })
            .where(eq(redeemRequests.id, redeemRequestId));

        return {
            orderId: newOrderId,
            dailyOrderNumber: createdDailyOrderNumber,
            orderNumber,
            deductedPoints: redeemReq.pointsDeducted,
            newBalance: balanceAfter
        };
    });

    // 🟢 I. إرسال Push Notification للعميل وللمطعم عبر FCM
    await sendPushNotification({
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

    await sendPushNotification({
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

    return SuccessResponse(res, {
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