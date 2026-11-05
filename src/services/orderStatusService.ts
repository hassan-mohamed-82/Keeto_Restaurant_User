import { db } from "../models/connection";
import {
    orders,
    orderItems,
    food,
    restaurantSettings,
    shippingCompanies,
    userRestaurantPoints,
    userPointsTransactions,
    userWallets,
    userWalletTransactions,
    deliveryMen,
    dispatchAssignments,
} from "../models/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { NotFound } from "../Errors";
import { handleCancelledOrder, settleDeliveredOrder } from "./restaurantWalletService";
import { releaseCourierForOrder, dispatchOrder } from "./shipping/dispatchEngine";
import { sendPushNotification } from "../utils/notifications";
import {
    notifyRestaurant,
    notifyOrderTracking,
    notifyAdmins,
    notifyShippingCompany,
    notifyDeliveryMan,
} from "./socket/socketService";
import { SOCKET_EVENTS } from "./socket/socketEvents";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type OrderRow = typeof orders.$inferSelect;

export interface ChangeOrderStatusParams {
    orderId: string;
    status: string;
    /** Optimistic guard: only proceed if the order is currently in one of these statuses. */
    expectedCurrentStatuses?: string[];
    /** Already-validated delivery man to assign (controller validates ownership). */
    deliveryManId?: string | null;
    /** Required when status === "cancelled". */
    cancel?: { reasonId: string | null; reasonText: string | null };
    /** "auto" = triggered by the cron, adds a note to loyalty transaction. */
    source?: "admin" | "auto";
    autoNote?: string;
}

export interface ChangeOrderStatusResult {
    changed: boolean;
    order?: OrderRow;
}

/** Safe wrapper: side effects after commit must never fail the request/cron. */
const safe = async (label: string, fn: () => unknown | Promise<unknown>) => {
    try {
        await fn();
    } catch (err) {
        console.error(`[changeOrderStatus:${label}] failed:`, err);
    }
};

// ---------------------------------------------------------------------------
// Inside-transaction helpers
// ---------------------------------------------------------------------------

async function refundWalletIfPaid(tx: Tx, order: OrderRow) {
    const [walletTx] = await tx
        .select()
        .from(userWalletTransactions)
        .where(
            and(
                eq(userWalletTransactions.reference, order.orderNumber),
                eq(userWalletTransactions.transactionType, "order_payment")
            )
        )
        .limit(1);
    if (!walletTx) return;

    const [userWallet] = await tx
        .select()
        .from(userWallets)
        .where(eq(userWallets.userId, order.userId))
        .limit(1);
    if (!userWallet) return;

    const balanceBefore = parseFloat(userWallet.balance ?? "0.00");
    const amountToRefund = parseFloat((order.totalAmount as string) || "0.00");
    const newBalance = balanceBefore + amountToRefund;

    await tx
        .update(userWallets)
        .set({ balance: newBalance.toFixed(2), updatedAt: new Date() })
        .where(eq(userWallets.id, userWallet.id));

    await tx.insert(userWalletTransactions).values({
        id: uuidv4(),
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

async function awardLoyaltyPoints(tx: Tx, order: OrderRow, now: Date, noteSuffix?: string) {
    if (!order.userId || !order.restaurantId) return;

    const items = await tx
        .select({ foodId: orderItems.foodId, quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
    if (items.length === 0) return;

    const foodPoints = await tx
        .select({ id: food.id, points: food.points })
        .from(food)
        .where(inArray(food.id, items.map((i) => i.foodId)));
    const pointsMap = new Map(foodPoints.map((f) => [f.id, f.points ?? 0]));

    let totalPointsEarned = 0;
    for (const item of items) {
        totalPointsEarned += (pointsMap.get(item.foodId) ?? 0) * item.quantity;
    }
    if (totalPointsEarned <= 0) return;

    let [record] = await tx
        .select()
        .from(userRestaurantPoints)
        .where(
            and(
                eq(userRestaurantPoints.userId, order.userId),
                eq(userRestaurantPoints.restaurantId, order.restaurantId)
            )
        )
        .limit(1);

    if (!record) {
        const newId = uuidv4();
        await tx.insert(userRestaurantPoints).values({
            id: newId,
            userId: order.userId,
            restaurantId: order.restaurantId,
            points: 0,
        });
        [record] = await tx
            .select()
            .from(userRestaurantPoints)
            .where(eq(userRestaurantPoints.id, newId))
            .limit(1);
    }

    const pointsBefore = record.points ?? 0;
    const pointsAfter = pointsBefore + totalPointsEarned;

    await tx
        .update(userRestaurantPoints)
        .set({ points: pointsAfter, updatedAt: now })
        .where(eq(userRestaurantPoints.id, record.id));

    await tx.insert(userPointsTransactions).values({
        id: uuidv4(),
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

function buildUserMessage(order: OrderRow, status: string, reasonText: string | null) {
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

async function autoDispatchIfNeeded(order: OrderRow, orderType: string | null, status: string, assignedDeliveryManId: string | null) {
    if (status !== "accepted" || orderType !== "delivery" || assignedDeliveryManId) return;

    let targetShippingCompanyId = order.shippingCompanyId;
    if (!targetShippingCompanyId && order.restaurantId) {
        const [settings] = await db
            .select({ shippingCompanyId: restaurantSettings.shippingCompanyId })
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, order.restaurantId))
            .limit(1);
        targetShippingCompanyId = settings?.shippingCompanyId || null;
    }
    if (!targetShippingCompanyId) return;

    const [company] = await db
        .select({ id: shippingCompanies.id, name: shippingCompanies.name, status: shippingCompanies.status })
        .from(shippingCompanies)
        .where(eq(shippingCompanies.id, targetShippingCompanyId))
        .limit(1);

    if (company && company.status === "active") {
        if (!order.shippingCompanyId) {
            await db
                .update(orders)
                .set({
                    shippingCompanyId: targetShippingCompanyId,
                    shippingStatus: "pending_dispatch",
                    updatedAt: new Date(),
                })
                .where(eq(orders.id, order.id));
        }
        dispatchOrder(order.id).catch((err: unknown) => {
            console.error(`[dispatchOrder:fire-and-forget] failed for order ${order.id} (Company: ${company.name}):`, err);
        });
    } else {
        console.warn(`[dispatchOrder] Shipping company ${targetShippingCompanyId} for restaurant ${order.restaurantId} is inactive or not found`);
        await db
            .update(orders)
            .set({
                shippingCompanyId: targetShippingCompanyId,
                shippingStatus: "manual_required",
                shippingFailReason: "company_inactive",
                updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));
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
export async function changeOrderStatus(params: ChangeOrderStatusParams): Promise<ChangeOrderStatusResult> {
    const { orderId, status, expectedCurrentStatuses, deliveryManId, cancel, source = "admin", autoNote } = params;
    const now = new Date();

    // ---------------- Transaction ----------------
    const existingOrder = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
        if (!existing) throw new NotFound("Order not found");

        const currentStatus = existing.status as string;
        if (currentStatus === status) return null;
        if (expectedCurrentStatuses && !expectedCurrentStatuses.includes(currentStatus)) return null;

        const isCancel = status === "cancelled";
        const payload: Record<string, unknown> = {
            status,
            statusChangedAt: now, // وقت دخول الحالة الجديدة (يستخدمه الـ Cron للقياس)
            updatedAt: now,
            cancelReasonId: isCancel ? cancel?.reasonId ?? null : null,
            cancelReason: isCancel ? cancel?.reasonText ?? null : null,
            cancelReasonType: isCancel ? "restaurant" : null,
        };
        if (deliveryManId) payload.deliveryManId = deliveryManId;
        if (status === "delivered") {
            payload.deliveredAt = now;
            payload.shippingStatus = "delivered";
        }

        // Optimistic guard: only update if status is still what we read.
        const [updateResult]: any = await tx
            .update(orders)
            .set(payload)
            .where(and(eq(orders.id, orderId), eq(orders.status, currentStatus as any)));
        if (!updateResult || Number(updateResult.affectedRows ?? 0) === 0) return null;

        if (status === "cancelled" || status === "rejected") {
            await refundWalletIfPaid(tx, existing);
        }

        if (status === "delivered") {
            await settleDeliveredOrder(orderId, tx);
            await awardLoyaltyPoints(
                tx,
                existing,
                now,
                source === "auto" ? autoNote ?? "Auto-delivered" : undefined
            );
        } else if (status === "cancelled") {
            await handleCancelledOrder({ orderId, cancelReasonType: "restaurant", tx });
        }

        return existing;
    });

    if (!existingOrder) return { changed: false };

    // ---------------- Post-commit side effects ----------------
    const orderType = existingOrder.orderType || (existingOrder as any).type || null;
    const targetDeliveryManId = deliveryManId || existingOrder.deliveryManId || null;
    const dailyOrOrderNo = existingOrder.dailyOrderNumber || existingOrder.orderNumber;

    // Push to customer
    const msg = buildUserMessage(existingOrder, status, cancel?.reasonText ?? null);
    await safe("pushUser", () =>
        sendPushNotification({
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
        })
    );

    // Push to delivery man
    if (orderType === "delivery" && targetDeliveryManId && (status === "out_for_delivery" || deliveryManId)) {
        await safe("pushDeliveryMan", () =>
            sendPushNotification({
                recipientType: "delivery_man",
                recipientId: targetDeliveryManId,
                branchId: existingOrder.branchId || null,
                title: status === "out_for_delivery" ? "طلب خارج للتوصيل" : "طلب جديد مُسند إليك",
                body:
                    status === "out_for_delivery"
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
            })
        );
    }

    // Shipping company dispatch
    await safe("autoDispatch", () =>
        autoDispatchIfNeeded(existingOrder, orderType, status, deliveryManId || existingOrder.deliveryManId || null)
    );

    // Release courier
    if (["delivered", "cancelled", "refund"].includes(status) && targetDeliveryManId) {
        releaseCourierForOrder(orderId, targetDeliveryManId).catch((err: unknown) => {
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
            notifyRestaurant(existingOrder.restaurantId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
        }
        notifyOrderTracking(existingOrder.id, SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
        notifyAdmins(SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
        if (existingOrder.shippingCompanyId) {
            notifyShippingCompany(existingOrder.shippingCompanyId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
        }
        if (targetDeliveryManId) {
            notifyDeliveryMan(targetDeliveryManId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
        }
    });

    return { changed: true, order: existingOrder };
}