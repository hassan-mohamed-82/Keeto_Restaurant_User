"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeOrderStatus = changeOrderStatus;
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const uuid_1 = require("uuid");
const Errors_1 = require("../Errors");
const restaurantWalletService_1 = require("./restaurantWalletService");
const dispatchEngine_1 = require("./shipping/dispatchEngine");
const notifications_1 = require("../utils/notifications");
const socketService_1 = require("./socket/socketService");
const socketEvents_1 = require("./socket/socketEvents");
/** Safe wrapper: side effects after commit must never fail the request/cron. */
const safe = async (label, fn) => {
    try {
        await fn();
    }
    catch (err) {
        console.error(`[changeOrderStatus:${label}] failed:`, err);
    }
};
// ---------------------------------------------------------------------------
// Inside-transaction helpers
// ---------------------------------------------------------------------------
async function refundWalletIfPaid(tx, order) {
    const [walletTx] = await tx
        .select()
        .from(schema_1.userWalletTransactions)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userWalletTransactions.reference, order.orderNumber), (0, drizzle_orm_1.eq)(schema_1.userWalletTransactions.transactionType, "order_payment")))
        .limit(1);
    if (!walletTx)
        return;
    const [userWallet] = await tx
        .select()
        .from(schema_1.userWallets)
        .where((0, drizzle_orm_1.eq)(schema_1.userWallets.userId, order.userId))
        .limit(1);
    if (!userWallet)
        return;
    const balanceBefore = parseFloat(userWallet.balance ?? "0.00");
    const amountToRefund = parseFloat(order.totalAmount || "0.00");
    const newBalance = balanceBefore + amountToRefund;
    await tx
        .update(schema_1.userWallets)
        .set({ balance: newBalance.toFixed(2), updatedAt: new Date() })
        .where((0, drizzle_orm_1.eq)(schema_1.userWallets.id, userWallet.id));
    await tx.insert(schema_1.userWalletTransactions).values({
        id: (0, uuid_1.v4)(),
        userId: order.userId,
        paymentMethodId: order.paymentMethod ?? null,
        type: "credit",
        transactionType: "refund",
        amount: amountToRefund.toFixed(2),
        balanceBefore: balanceBefore.toFixed(2),
        reference: order.orderNumber,
        status: "approved",
        createdAt: new Date(),
    });
}
async function awardLoyaltyPoints(tx, order, now, noteSuffix) {
    if (!order.userId || !order.restaurantId)
        return;
    // إذا كان الطلب ناتجاً عن استبدال نقاط (Redeemed Points Order)، لا يتم منح نقاط جديدة للعميل
    if (order.isPointsRedeemed || (order.redeemCode && order.redeemCode.trim() !== "")) {
        return;
    }
    const items = await tx
        .select({ foodId: schema_1.orderItems.foodId, quantity: schema_1.orderItems.quantity })
        .from(schema_1.orderItems)
        .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, order.id));
    if (items.length === 0)
        return;
    const foodPoints = await tx
        .select({ id: schema_1.food.id, points: schema_1.food.points })
        .from(schema_1.food)
        .where((0, drizzle_orm_1.inArray)(schema_1.food.id, items.map((i) => i.foodId)));
    const pointsMap = new Map(foodPoints.map((f) => [f.id, f.points ?? 0]));
    let totalPointsEarned = 0;
    for (const item of items) {
        totalPointsEarned += (pointsMap.get(item.foodId) ?? 0) * item.quantity;
    }
    if (totalPointsEarned <= 0)
        return;
    let [record] = await tx
        .select()
        .from(schema_1.userRestaurantPoints)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.userId, order.userId), (0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.restaurantId, order.restaurantId)))
        .limit(1);
    if (!record) {
        const newId = (0, uuid_1.v4)();
        await tx.insert(schema_1.userRestaurantPoints).values({
            id: newId,
            userId: order.userId,
            restaurantId: order.restaurantId,
            points: 0,
        });
        [record] = await tx
            .select()
            .from(schema_1.userRestaurantPoints)
            .where((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.id, newId))
            .limit(1);
    }
    const pointsBefore = record.points ?? 0;
    const pointsAfter = pointsBefore + totalPointsEarned;
    await tx
        .update(schema_1.userRestaurantPoints)
        .set({ points: pointsAfter, updatedAt: now })
        .where((0, drizzle_orm_1.eq)(schema_1.userRestaurantPoints.id, record.id));
    await tx.insert(schema_1.userPointsTransactions).values({
        id: (0, uuid_1.v4)(),
        userId: order.userId,
        restaurantId: order.restaurantId,
        type: "earn",
        points: totalPointsEarned,
        balanceBefore: pointsBefore,
        balanceAfter: pointsAfter,
        orderId: order.id,
        note: `${noteSuffix ? noteSuffix + ": " : ""}Earned ${totalPointsEarned} points from order #${order.orderNumber}`,
        createdAt: now,
    });
}
// ---------------------------------------------------------------------------
// Post-commit helpers
// ---------------------------------------------------------------------------
function buildUserMessage(order, status, reasonText) {
    const num = order.dailyOrderNumber || order.orderNumber;
    if (status === "cancelled") {
        return { title: "Order Update", body: `Your order ${num} was cancelled. Reason: ${reasonText || "Not specified"}` };
    }
    if (status === "delivered") {
        return {
            title: "تم تسليم الطلب | Order Delivered",
            body: `طلبك رقم #${num} تم تسليمه بنجاح. شكراً لطلبك من كيتو!`,
        };
    }
    return { title: "Order Update", body: `Your order ${num} is now ${status}.` };
}
async function autoDispatchIfNeeded(order, orderType, status, assignedDeliveryManId) {
    if (status !== "accepted" || orderType !== "delivery" || assignedDeliveryManId)
        return;
    let targetShippingCompanyId = order.shippingCompanyId;
    if (!targetShippingCompanyId && order.restaurantId) {
        const [settings] = await connection_1.db
            .select({ shippingCompanyId: schema_1.restaurantSettings.shippingCompanyId })
            .from(schema_1.restaurantSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, order.restaurantId))
            .limit(1);
        targetShippingCompanyId = settings?.shippingCompanyId || null;
    }
    if (!targetShippingCompanyId)
        return;
    const [company] = await connection_1.db
        .select({ id: schema_1.shippingCompanies.id, name: schema_1.shippingCompanies.name, status: schema_1.shippingCompanies.status })
        .from(schema_1.shippingCompanies)
        .where((0, drizzle_orm_1.eq)(schema_1.shippingCompanies.id, targetShippingCompanyId))
        .limit(1);
    if (company && company.status === "active") {
        if (!order.shippingCompanyId) {
            await connection_1.db
                .update(schema_1.orders)
                .set({
                shippingCompanyId: targetShippingCompanyId,
                shippingStatus: "pending_dispatch",
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.orders.id, order.id));
        }
        (0, dispatchEngine_1.dispatchOrder)(order.id).catch((err) => {
            console.error(`[dispatchOrder:fire-and-forget] failed for order ${order.id} (Company: ${company.name}):`, err);
        });
    }
    else {
        console.warn(`[dispatchOrder] Shipping company ${targetShippingCompanyId} for restaurant ${order.restaurantId} is inactive or not found`);
        await connection_1.db
            .update(schema_1.orders)
            .set({
            shippingCompanyId: targetShippingCompanyId,
            shippingStatus: "manual_required",
            shippingFailReason: "company_inactive",
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, order.id));
    }
}
// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
/**
 * Single source of truth for changing an order's status.
 * Used by the admin controller AND the auto-deliver cron.
 *
 * Returns { changed: false } if the order was modified concurrently
 * (status guard failed) so callers can ignore/report it.
 */
async function changeOrderStatus(params) {
    const { orderId, status, expectedCurrentStatuses, deliveryManId, cancel, source = "admin", autoNote } = params;
    const now = new Date();
    // ---------------- Transaction ----------------
    const existingOrder = await connection_1.db.transaction(async (tx) => {
        const [existing] = await tx.select().from(schema_1.orders).where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId)).limit(1);
        if (!existing)
            throw new Errors_1.NotFound("Order not found");
        const currentStatus = existing.status;
        if (currentStatus === status)
            return null;
        if (expectedCurrentStatuses && !expectedCurrentStatuses.includes(currentStatus))
            return null;
        const isCancel = status === "cancelled";
        const payload = {
            status,
            statusChangedAt: now, // وقت دخول الحالة الجديدة (يستخدمه الـ Cron للقياس)
            updatedAt: now,
            cancelReasonId: isCancel ? cancel?.reasonId ?? null : null,
            cancelReason: isCancel ? cancel?.reasonText ?? null : null,
            cancelReasonType: isCancel ? "restaurant" : null,
        };
        if (deliveryManId)
            payload.deliveryManId = deliveryManId;
        if (status === "delivered") {
            payload.deliveredAt = now;
            payload.shippingStatus = "delivered";
        }
        // Optimistic guard: only update if status is still what we read.
        const [updateResult] = await tx
            .update(schema_1.orders)
            .set(payload)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId), (0, drizzle_orm_1.eq)(schema_1.orders.status, currentStatus)));
        if (!updateResult || Number(updateResult.affectedRows ?? 0) === 0)
            return null;
        if (status === "cancelled" || status === "rejected") {
            await refundWalletIfPaid(tx, existing);
        }
        if (status === "delivered") {
            await (0, restaurantWalletService_1.settleDeliveredOrder)(orderId, tx);
            await awardLoyaltyPoints(tx, existing, now, source === "auto" ? autoNote ?? "Auto-delivered" : undefined);
        }
        else if (status === "cancelled") {
            await (0, restaurantWalletService_1.handleCancelledOrder)({ orderId, cancelReasonType: "restaurant", tx });
        }
        return existing;
    });
    if (!existingOrder)
        return { changed: false };
    // ---------------- Post-commit side effects ----------------
    const orderType = existingOrder.orderType || existingOrder.type || null;
    const targetDeliveryManId = deliveryManId || existingOrder.deliveryManId || null;
    const dailyOrOrderNo = existingOrder.dailyOrderNumber || existingOrder.orderNumber;
    // Push to customer
    const msg = buildUserMessage(existingOrder, status, cancel?.reasonText ?? null);
    await safe("pushUser", () => (0, notifications_1.sendPushNotification)({
        recipientType: "user",
        recipientId: existingOrder.userId,
        branchId: existingOrder.branchId || null,
        title: msg.title,
        body: msg.body,
        data: {
            restaurantId: existingOrder.restaurantId,
            branchId: existingOrder.branchId || null,
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            dailyOrderNumber: existingOrder.dailyOrderNumber,
            status,
            type: "ORDER_STATUS_UPDATE",
        },
    }));
    // Push to delivery man
    if (orderType === "delivery" && targetDeliveryManId && (status === "out_for_delivery" || deliveryManId)) {
        await safe("pushDeliveryMan", () => (0, notifications_1.sendPushNotification)({
            recipientType: "delivery_man",
            recipientId: targetDeliveryManId,
            branchId: existingOrder.branchId || null,
            title: status === "out_for_delivery" ? "طلب خارج للتوصيل" : "طلب جديد مُسند إليك",
            body: status === "out_for_delivery"
                ? `الطلب رقم #${dailyOrOrderNo} أصبح خارجاً للتوصيل ومُسند إليك.`
                : `تم إسناد الطلب رقم #${dailyOrOrderNo} إليك.`,
            data: {
                restaurantId: existingOrder.restaurantId,
                branchId: existingOrder.branchId || null,
                orderId: existingOrder.id,
                orderNumber: existingOrder.orderNumber,
                dailyOrderNumber: existingOrder.dailyOrderNumber,
                status,
                type: status === "out_for_delivery" ? "ORDER_OUT_FOR_DELIVERY" : "ORDER_ASSIGNED",
            },
        }));
    }
    // Shipping company dispatch
    await safe("autoDispatch", () => autoDispatchIfNeeded(existingOrder, orderType, status, deliveryManId || existingOrder.deliveryManId || null));
    // Release courier
    if (["delivered", "cancelled", "refund"].includes(status) && targetDeliveryManId) {
        (0, dispatchEngine_1.releaseCourierForOrder)(orderId, targetDeliveryManId).catch((err) => {
            console.error(`[releaseCourierForOrder] failed for order ${orderId}:`, err);
        });
    }
    // WebSockets
    const statusPayload = {
        orderId: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
        dailyOrderNumber: existingOrder.dailyOrderNumber,
        status,
        updatedAt: now,
    };
    await safe("sockets", () => {
        if (existingOrder.restaurantId) {
            (0, socketService_1.notifyRestaurant)(existingOrder.restaurantId, socketEvents_1.SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
        }
        (0, socketService_1.notifyOrderTracking)(existingOrder.id, socketEvents_1.SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
        (0, socketService_1.notifyAdmins)(socketEvents_1.SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
        if (existingOrder.shippingCompanyId) {
            (0, socketService_1.notifyShippingCompany)(existingOrder.shippingCompanyId, socketEvents_1.SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
        }
        if (targetDeliveryManId) {
            (0, socketService_1.notifyDeliveryMan)(targetDeliveryManId, socketEvents_1.SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
        }
    });
    return { changed: true, order: existingOrder };
}
