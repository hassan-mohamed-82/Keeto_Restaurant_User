"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processExpiredWeightRequests = processExpiredWeightRequests;
exports.initWeightRequestCron = initWeightRequestCron;
const node_cron_1 = __importDefault(require("node-cron"));
const drizzle_orm_1 = require("drizzle-orm");
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const weightRequest_helper_1 = require("../helpers/weightRequest.helper");
const socketService_1 = require("./socket/socketService");
const notifications_1 = require("../utils/notifications");
// Weight-request expiry cron (Keeto_Restaurant_User only).
//
// Safe with several instances: every change happens in a transaction on rows locked FOR UPDATE,
// the decision is re-made on the locked rows, and every write is conditional on the status it
// expects. Only the instance whose conditional update actually changed the request notifies, and
// notifications are sent AFTER the transaction commits (a failure there never breaks the cleanup).
const BATCH_SIZE = 50;
const ORPHAN_BATCH_SIZE = 200;
let isRunning = false;
/** Normal cleanup: restaurant-added rows deleted, the customer's rows unlocked and reset. */
const cleanupCartForRequest = async (tx, requestId, now) => {
    await tx.delete(schema_1.cartItems).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, requestId), (0, drizzle_orm_1.eq)(schema_1.cartItems.addedBy, "restaurant")));
    await tx
        .update(schema_1.cartItems)
        .set({ weightRequestId: null, finalWeight: null, isUnavailable: false, updatedAt: now })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, requestId), (0, drizzle_orm_1.eq)(schema_1.cartItems.addedBy, "customer")));
};
/** checking_out → awaiting_customer_approval with a fresh customer window; weighted rows stay locked. */
const revertToApproval = async (tx, request, now, extraWhere, incrementAttempts) => {
    const [settings] = await tx
        .select({ weightCustomerTimeoutMin: schema_1.restaurantSettings.weightCustomerTimeoutMin })
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, request.restaurantId))
        .limit(1);
    const timeoutMin = settings?.weightCustomerTimeoutMin ?? weightRequest_helper_1.DEFAULT_WEIGHT_CUSTOMER_TIMEOUT_MIN;
    const result = await tx
        .update(schema_1.weightRequests)
        .set({
        status: "awaiting_customer_approval",
        expiresAt: new Date(now.getTime() + timeoutMin * 60 * 1000),
        checkoutStartedAt: null,
        ...(incrementAttempts ? { paymentAttempts: (0, drizzle_orm_1.sql) `${schema_1.weightRequests.paymentAttempts} + 1` } : {}),
        updatedAt: now,
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, request.id), (0, drizzle_orm_1.eq)(schema_1.weightRequests.status, "checking_out"), extraWhere));
    return (0, weightRequest_helper_1.affectedRows)(result) === 1;
};
/** Applies one decided action to the locked rows. Returns the notification to send after commit. */
const applyAction = async (tx, action, request, order, now) => {
    switch (action.kind) {
        case "expire": {
            // Conditional on the status we decided on (captured under the lock) and on the deadline.
            const result = await tx
                .update(schema_1.weightRequests)
                .set({ status: "expired", cancelReason: action.reason, checkoutStartedAt: null, updatedAt: now })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, request.id), (0, drizzle_orm_1.eq)(schema_1.weightRequests.status, request.status), (0, drizzle_orm_1.lt)(schema_1.weightRequests.expiresAt, now)));
            if ((0, weightRequest_helper_1.affectedRows)(result) !== 1)
                return null;
            await cleanupCartForRequest(tx, request.id, now);
            return action.notify === "customer"
                ? { to: "customer", userId: request.userId, restaurantId: request.restaurantId, branchId: request.branchId, requestId: request.id, reason: action.reason }
                : { to: "restaurant", restaurantId: request.restaurantId, branchId: request.branchId, requestId: request.id, reason: action.reason };
        }
        case "revert_claim":
            await revertToApproval(tx, request, now, (0, drizzle_orm_1.isNull)(schema_1.weightRequests.orderId), false);
            return null;
        case "revert_failed":
            await revertToApproval(tx, request, now, (0, drizzle_orm_1.eq)(schema_1.weightRequests.orderId, order.id), false);
            return null;
        case "approve_paid": {
            const result = await tx
                .update(schema_1.weightRequests)
                .set({ status: "approved", checkoutStartedAt: null, updatedAt: now })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, request.id), (0, drizzle_orm_1.eq)(schema_1.weightRequests.status, "checking_out"), (0, drizzle_orm_1.eq)(schema_1.weightRequests.orderId, order.id)));
            if ((0, weightRequest_helper_1.affectedRows)(result) === 1) {
                await tx.delete(schema_1.cartItems).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.userId, request.userId), (0, drizzle_orm_1.eq)(schema_1.cartItems.restaurantId, request.restaurantId)));
            }
            return null;
        }
        case "fail_abandoned": {
            // Same order / coupon effects as a failed payment (A5), without a payment_transactions row:
            // the gateway never answered. Never overwrites an order that left pending_payment.
            const failed = await tx
                .update(schema_1.orders)
                .set({
                status: "failed",
                paymentStatus: "payment_failed",
                paymentFailureReason: "Payment abandoned: no gateway response",
                updatedAt: now,
            })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, order.id), (0, drizzle_orm_1.eq)(schema_1.orders.paymentStatus, "pending_payment"), (0, drizzle_orm_1.eq)(schema_1.orders.status, "pending")));
            if ((0, weightRequest_helper_1.affectedRows)(failed) !== 1)
                return null;
            const [usage] = await tx.select().from(schema_1.couponUsages).where((0, drizzle_orm_1.eq)(schema_1.couponUsages.orderId, order.id)).limit(1);
            if (usage) {
                await tx.delete(schema_1.couponUsages).where((0, drizzle_orm_1.eq)(schema_1.couponUsages.id, usage.id));
                if (usage.couponId) {
                    await tx.update(schema_1.coupons).set({ usedCount: (0, drizzle_orm_1.sql) `GREATEST(used_count - 1, 0)` }).where((0, drizzle_orm_1.eq)(schema_1.coupons.id, usage.couponId));
                }
            }
            if ((0, weightRequest_helper_1.abandonedPaymentOutcome)(request.paymentAttempts ?? 0) === "revert") {
                await revertToApproval(tx, request, now, (0, drizzle_orm_1.eq)(schema_1.weightRequests.orderId, order.id), true);
                return null;
            }
            const expired = await tx
                .update(schema_1.weightRequests)
                .set({
                status: "expired",
                cancelReason: weightRequest_helper_1.EXPIRE_REASON_PAYMENTS,
                checkoutStartedAt: null,
                paymentAttempts: (0, drizzle_orm_1.sql) `${schema_1.weightRequests.paymentAttempts} + 1`,
                updatedAt: now,
            })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, request.id), (0, drizzle_orm_1.eq)(schema_1.weightRequests.status, "checking_out")));
            if ((0, weightRequest_helper_1.affectedRows)(expired) !== 1)
                return null;
            await cleanupCartForRequest(tx, request.id, now);
            return { to: "customer", userId: request.userId, restaurantId: request.restaurantId, branchId: request.branchId, requestId: request.id, reason: weightRequest_helper_1.EXPIRE_REASON_PAYMENTS };
        }
        default:
            return null;
    }
};
const sendNotification = async (n) => {
    try {
        if (n.to === "customer") {
            const body = n.reason === weightRequest_helper_1.EXPIRE_REASON_PAYMENTS
                ? "لم تكتمل عملية الدفع عدة مرات، تم إلغاء طلب الوزن. يمكنك إرسال السلة للوزن مرة أخرى."
                : "لم يقم المطعم بوزن طلبك في الوقت المحدد، تم إلغاء طلب الوزن. يمكنك إرسال السلة مرة أخرى.";
            (0, socketService_1.notifyUser)(n.userId, "weight_request_expired", {
                weightRequestId: n.requestId,
                restaurantId: n.restaurantId,
                branchId: n.branchId,
                reason: n.reason,
            });
            await (0, notifications_1.sendPushNotification)({
                recipientType: "user",
                recipientId: n.userId,
                restaurantId: n.restaurantId,
                branchId: n.branchId,
                title: "انتهت صلاحية طلب الوزن ⏰",
                body,
                data: {
                    type: "weight_request_expired",
                    weightRequestId: n.requestId,
                    restaurantId: n.restaurantId,
                    branchId: n.branchId,
                    reason: n.reason,
                },
            });
        }
        else {
            await (0, notifications_1.sendPushNotification)({
                recipientType: "restaurant",
                recipientId: n.restaurantId,
                branchId: n.branchId,
                title: "انتهت صلاحية طلب وزن ⏰",
                body: "لم يقم العميل بتأكيد الأوزان في الوقت المحدد، تم إلغاء طلب الوزن.",
                data: {
                    type: "weight_request_expired",
                    weightRequestId: n.requestId,
                    restaurantId: n.restaurantId,
                    branchId: n.branchId,
                    reason: n.reason,
                },
            });
        }
    }
    catch (err) {
        console.warn(`[weightRequestCron] notification failed for request ${n.requestId}:`, err);
    }
};
/**
 * One pass: expiry of awaiting_* requests, stale / abandoned / already-paid checking_out requests,
 * then orphan restaurant-added cart rows. Returns counters for logging and tests.
 */
async function processExpiredWeightRequests(now = new Date()) {
    const stats = { checked: 0, changed: 0, notified: 0, orphansDeleted: 0 };
    const candidates = await connection_1.db
        .select()
        .from(schema_1.weightRequests)
        .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.weightRequests.status, ["awaiting_weighing", "awaiting_customer_approval"]), (0, drizzle_orm_1.lt)(schema_1.weightRequests.expiresAt, now)), (0, drizzle_orm_1.eq)(schema_1.weightRequests.status, "checking_out")))
        .limit(BATCH_SIZE);
    for (const candidate of candidates) {
        stats.checked++;
        try {
            let notification = null;
            let changed = false;
            await connection_1.db.transaction(async (tx) => {
                const [request] = await tx.select().from(schema_1.weightRequests).where((0, drizzle_orm_1.eq)(schema_1.weightRequests.id, candidate.id)).for("update");
                if (!request)
                    return;
                const [order] = request.orderId
                    ? await tx.select().from(schema_1.orders).where((0, drizzle_orm_1.eq)(schema_1.orders.id, request.orderId)).for("update")
                    : [null];
                // Re-decide on the locked rows: approved / cancelled / changed in the meantime → "none".
                const action = (0, weightRequest_helper_1.decideCronAction)(request, order ?? null, now);
                if (action.kind === "none")
                    return;
                notification = await applyAction(tx, action, request, order, now);
                changed = true;
            });
            if (changed)
                stats.changed++;
            if (notification) {
                await sendNotification(notification);
                stats.notified++;
            }
        }
        catch (err) {
            console.error(`[weightRequestCron] failed for request ${candidate.id}:`, err);
        }
    }
    // Orphan cleanup: restaurant-added rows with no request, or whose request no longer owns the cart.
    try {
        const orphans = await connection_1.db
            .select({ id: schema_1.cartItems.id })
            .from(schema_1.cartItems)
            .leftJoin(schema_1.weightRequests, (0, drizzle_orm_1.eq)(schema_1.cartItems.weightRequestId, schema_1.weightRequests.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.cartItems.addedBy, "restaurant"), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.cartItems.weightRequestId), (0, drizzle_orm_1.isNull)(schema_1.weightRequests.id), (0, drizzle_orm_1.notInArray)(schema_1.weightRequests.status, [...weightRequest_helper_1.CART_OWNING_STATUSES]))))
            .limit(ORPHAN_BATCH_SIZE);
        if (orphans.length > 0) {
            await connection_1.db.delete(schema_1.cartItems).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.cartItems.id, orphans.map((o) => o.id)), (0, drizzle_orm_1.eq)(schema_1.cartItems.addedBy, "restaurant")));
            stats.orphansDeleted = orphans.length;
        }
    }
    catch (err) {
        console.error("[weightRequestCron] orphan cleanup failed:", err);
    }
    return stats;
}
/**
 * Starts the cron (every minute).
 * Multi-instance setups: set RUN_CRON=false on every instance but one (same flag as the auto-deliver cron).
 */
function initWeightRequestCron() {
    if (process.env.RUN_CRON === "false") {
        console.log("[weightRequestCron] disabled on this instance (RUN_CRON=false).");
        return;
    }
    node_cron_1.default.schedule("* * * * *", async () => {
        if (isRunning)
            return;
        isRunning = true;
        try {
            const stats = await processExpiredWeightRequests();
            if (stats.changed || stats.orphansDeleted) {
                console.log(`[weightRequestCron] changed=${stats.changed} notified=${stats.notified} orphansDeleted=${stats.orphansDeleted}`);
            }
        }
        catch (err) {
            console.error("[weightRequestCron] Error processing weight requests:", err);
        }
        finally {
            isRunning = false;
        }
    });
    console.log("[weightRequestCron] Initialized: running every minute.");
}
