import cron from "node-cron";
import { and, eq, inArray, isNull, lt, or, sql, notInArray } from "drizzle-orm";
import { db } from "../models/connection";
import {
    weightRequests,
    cartItems,
    orders,
    restaurantSettings,
    couponUsages,
    coupons,
} from "../models/schema";
import {
    abandonedPaymentOutcome,
    affectedRows,
    CART_OWNING_STATUSES,
    decideCronAction,
    DEFAULT_WEIGHT_CUSTOMER_TIMEOUT_MIN,
    EXPIRE_REASON_PAYMENTS,
    type CronAction,
} from "../helpers/weightRequest.helper";
import { notifyUser } from "./socket/socketService";
import { sendPushNotification } from "../utils/notifications";

// Weight-request expiry cron (Keeto_Restaurant_User only).
//
// Safe with several instances: every change happens in a transaction on rows locked FOR UPDATE,
// the decision is re-made on the locked rows, and every write is conditional on the status it
// expects. Only the instance whose conditional update actually changed the request notifies, and
// notifications are sent AFTER the transaction commits (a failure there never breaks the cleanup).

const BATCH_SIZE = 50;
const ORPHAN_BATCH_SIZE = 200;

let isRunning = false;

type PendingNotification =
    | { to: "customer"; userId: string; requestId: string; reason: string }
    | { to: "restaurant"; restaurantId: string; branchId: string | null; requestId: string; reason: string };

/** Normal cleanup: restaurant-added rows deleted, the customer's rows unlocked and reset. */
const cleanupCartForRequest = async (tx: any, requestId: string, now: Date) => {
    await tx.delete(cartItems).where(and(eq(cartItems.weightRequestId, requestId), eq(cartItems.addedBy, "restaurant")));
    await tx
        .update(cartItems)
        .set({ weightRequestId: null, finalWeight: null, isUnavailable: false, updatedAt: now })
        .where(and(eq(cartItems.weightRequestId, requestId), eq(cartItems.addedBy, "customer")));
};

/** checking_out → awaiting_customer_approval with a fresh customer window; weighted rows stay locked. */
const revertToApproval = async (tx: any, request: any, now: Date, extraWhere: any, incrementAttempts: boolean) => {
    const [settings] = await tx
        .select({ weightCustomerTimeoutMin: restaurantSettings.weightCustomerTimeoutMin })
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, request.restaurantId))
        .limit(1);
    const timeoutMin = settings?.weightCustomerTimeoutMin ?? DEFAULT_WEIGHT_CUSTOMER_TIMEOUT_MIN;
    const result = await tx
        .update(weightRequests)
        .set({
            status: "awaiting_customer_approval",
            expiresAt: new Date(now.getTime() + timeoutMin * 60 * 1000),
            checkoutStartedAt: null,
            ...(incrementAttempts ? { paymentAttempts: sql`${weightRequests.paymentAttempts} + 1` } : {}),
            updatedAt: now,
        })
        .where(and(eq(weightRequests.id, request.id), eq(weightRequests.status, "checking_out"), extraWhere));
    return affectedRows(result) === 1;
};

/** Applies one decided action to the locked rows. Returns the notification to send after commit. */
const applyAction = async (tx: any, action: CronAction, request: any, order: any, now: Date): Promise<PendingNotification | null> => {
    switch (action.kind) {
        case "expire": {
            // Conditional on the status we decided on (captured under the lock) and on the deadline.
            const result = await tx
                .update(weightRequests)
                .set({ status: "expired", cancelReason: action.reason, checkoutStartedAt: null, updatedAt: now })
                .where(and(
                    eq(weightRequests.id, request.id),
                    eq(weightRequests.status, request.status),
                    lt(weightRequests.expiresAt, now)
                ));
            if (affectedRows(result) !== 1) return null;
            await cleanupCartForRequest(tx, request.id, now);
            return action.notify === "customer"
                ? { to: "customer", userId: request.userId, requestId: request.id, reason: action.reason }
                : { to: "restaurant", restaurantId: request.restaurantId, branchId: request.branchId, requestId: request.id, reason: action.reason };
        }

        case "revert_claim":
            await revertToApproval(tx, request, now, isNull(weightRequests.orderId), false);
            return null;

        case "revert_failed":
            await revertToApproval(tx, request, now, eq(weightRequests.orderId, order.id), false);
            return null;

        case "approve_paid": {
            const result = await tx
                .update(weightRequests)
                .set({ status: "approved", checkoutStartedAt: null, updatedAt: now })
                .where(and(eq(weightRequests.id, request.id), eq(weightRequests.status, "checking_out"), eq(weightRequests.orderId, order.id)));
            if (affectedRows(result) === 1) {
                await tx.delete(cartItems).where(and(eq(cartItems.userId, request.userId), eq(cartItems.restaurantId, request.restaurantId)));
            }
            return null;
        }

        case "fail_abandoned": {
            // Same order / coupon effects as a failed payment (A5), without a payment_transactions row:
            // the gateway never answered. Never overwrites an order that left pending_payment.
            const failed = await tx
                .update(orders)
                .set({
                    status: "failed",
                    paymentStatus: "payment_failed",
                    paymentFailureReason: "Payment abandoned: no gateway response",
                    updatedAt: now,
                })
                .where(and(eq(orders.id, order.id), eq(orders.paymentStatus, "pending_payment"), eq(orders.status, "pending")));
            if (affectedRows(failed) !== 1) return null;

            const [usage] = await tx.select().from(couponUsages).where(eq(couponUsages.orderId, order.id)).limit(1);
            if (usage) {
                await tx.delete(couponUsages).where(eq(couponUsages.id, usage.id));
                if (usage.couponId) {
                    await tx.update(coupons).set({ usedCount: sql`GREATEST(used_count - 1, 0)` }).where(eq(coupons.id, usage.couponId));
                }
            }

            if (abandonedPaymentOutcome(request.paymentAttempts ?? 0) === "revert") {
                await revertToApproval(tx, request, now, eq(weightRequests.orderId, order.id), true);
                return null;
            }
            const expired = await tx
                .update(weightRequests)
                .set({
                    status: "expired",
                    cancelReason: EXPIRE_REASON_PAYMENTS,
                    checkoutStartedAt: null,
                    paymentAttempts: sql`${weightRequests.paymentAttempts} + 1`,
                    updatedAt: now,
                })
                .where(and(eq(weightRequests.id, request.id), eq(weightRequests.status, "checking_out")));
            if (affectedRows(expired) !== 1) return null;
            await cleanupCartForRequest(tx, request.id, now);
            return { to: "customer", userId: request.userId, requestId: request.id, reason: EXPIRE_REASON_PAYMENTS };
        }

        default:
            return null;
    }
};

const sendNotification = async (n: PendingNotification) => {
    try {
        if (n.to === "customer") {
            const body = n.reason === EXPIRE_REASON_PAYMENTS
                ? "لم تكتمل عملية الدفع عدة مرات، تم إلغاء طلب الوزن. يمكنك إرسال السلة للوزن مرة أخرى."
                : "لم يقم المطعم بوزن طلبك في الوقت المحدد، تم إلغاء طلب الوزن. يمكنك إرسال السلة مرة أخرى.";
            notifyUser(n.userId, "weight_request_expired", { weightRequestId: n.requestId, reason: n.reason });
            await sendPushNotification({
                recipientType: "user",
                recipientId: n.userId,
                title: "انتهت صلاحية طلب الوزن ⏰",
                body,
                data: { type: "weight_request_expired", weightRequestId: n.requestId, reason: n.reason },
            });
        } else {
            await sendPushNotification({
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
    } catch (err) {
        console.warn(`[weightRequestCron] notification failed for request ${n.requestId}:`, err);
    }
};

/**
 * One pass: expiry of awaiting_* requests, stale / abandoned / already-paid checking_out requests,
 * then orphan restaurant-added cart rows. Returns counters for logging and tests.
 */
export async function processExpiredWeightRequests(now: Date = new Date()) {
    const stats = { checked: 0, changed: 0, notified: 0, orphansDeleted: 0 };

    const candidates = await db
        .select()
        .from(weightRequests)
        .where(or(
            and(inArray(weightRequests.status, ["awaiting_weighing", "awaiting_customer_approval"]), lt(weightRequests.expiresAt, now)),
            eq(weightRequests.status, "checking_out")
        ))
        .limit(BATCH_SIZE);

    for (const candidate of candidates) {
        stats.checked++;
        try {
            let notification: PendingNotification | null = null;
            let changed = false;

            await db.transaction(async (tx) => {
                const [request] = await tx.select().from(weightRequests).where(eq(weightRequests.id, candidate.id)).for("update");
                if (!request) return;
                const [order] = request.orderId
                    ? await tx.select().from(orders).where(eq(orders.id, request.orderId)).for("update")
                    : [null];

                // Re-decide on the locked rows: approved / cancelled / changed in the meantime → "none".
                const action = decideCronAction(request, order ?? null, now);
                if (action.kind === "none") return;
                notification = await applyAction(tx, action, request, order, now);
                changed = true;
            });

            if (changed) stats.changed++;
            if (notification) {
                await sendNotification(notification);
                stats.notified++;
            }
        } catch (err) {
            console.error(`[weightRequestCron] failed for request ${candidate.id}:`, err);
        }
    }

    // Orphan cleanup: restaurant-added rows with no request, or whose request no longer owns the cart.
    try {
        const orphans = await db
            .select({ id: cartItems.id })
            .from(cartItems)
            .leftJoin(weightRequests, eq(cartItems.weightRequestId, weightRequests.id))
            .where(and(
                eq(cartItems.addedBy, "restaurant"),
                or(
                    isNull(cartItems.weightRequestId),
                    isNull(weightRequests.id),
                    notInArray(weightRequests.status, [...CART_OWNING_STATUSES])
                )
            ))
            .limit(ORPHAN_BATCH_SIZE);
        if (orphans.length > 0) {
            await db.delete(cartItems).where(and(
                inArray(cartItems.id, orphans.map((o) => o.id)),
                eq(cartItems.addedBy, "restaurant")
            ));
            stats.orphansDeleted = orphans.length;
        }
    } catch (err) {
        console.error("[weightRequestCron] orphan cleanup failed:", err);
    }

    return stats;
}

/**
 * Starts the cron (every minute).
 * Multi-instance setups: set RUN_CRON=false on every instance but one (same flag as the auto-deliver cron).
 */
export function initWeightRequestCron() {
    if (process.env.RUN_CRON === "false") {
        console.log("[weightRequestCron] disabled on this instance (RUN_CRON=false).");
        return;
    }
    cron.schedule("* * * * *", async () => {
        if (isRunning) return;
        isRunning = true;
        try {
            const stats = await processExpiredWeightRequests();
            if (stats.changed || stats.orphansDeleted) {
                console.log(`[weightRequestCron] changed=${stats.changed} notified=${stats.notified} orphansDeleted=${stats.orphansDeleted}`);
            }
        } catch (err) {
            console.error("[weightRequestCron] Error processing weight requests:", err);
        } finally {
            isRunning = false;
        }
    });
    console.log("[weightRequestCron] Initialized: running every minute.");
}
