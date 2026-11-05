import cron from "node-cron";
import { db } from "../models/connection";
import {
    orders,
    orderItems,
    food,
    restaurantSettings,
    userRestaurantPoints,
    userPointsTransactions,
    deliveryMen,
    dispatchAssignments,
} from "../models/schema";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { settleDeliveredOrder } from "./restaurantWalletService";
import { releaseCourierForOrder } from "./shipping/dispatchEngine";
import { sendPushNotification } from "../utils/notifications";
import {
    notifyRestaurant,
    notifyOrderTracking,
    notifyAdmins,
    notifyShippingCompany,
} from "./socket/socketService";
import { SOCKET_EVENTS } from "./socket/socketEvents";

/**
 * Calculates the expected timeout in minutes for an order based strictly on:
 * 1. order.durationOrderPreparing
 * 2. restaurantSettings (maxDeliveryTime, maxTakeAwayTime, maxDineInTime, minDeliveryTime)
 *
 * NOTE: We do NOT use generic fallbacks or repeatNotificationDuration.
 * If no valid time is found on the order or restaurant settings, returns null (meaning do not auto-deliver).
 */
export function getOrderTimeoutMinutes(order: {
    status: string | null;
    orderType?: string | null;
    durationOrderPreparing?: number | null;
    maxDeliveryTime?: number | null;
    minDeliveryTime?: number | null;
    maxTakeAwayTime?: number | null;
    maxDineInTime?: number | null;
}): number | null {
    if (order.status === "preparing") {
        if (order.durationOrderPreparing && order.durationOrderPreparing > 0) {
            return order.durationOrderPreparing;
        }
        if (order.minDeliveryTime && order.minDeliveryTime > 0) {
            return order.minDeliveryTime;
        }
    } else if (order.status === "out_for_delivery") {
        const orderType = order.orderType || "delivery";
        if (orderType === "takeaway" && order.maxTakeAwayTime && order.maxTakeAwayTime > 0) {
            return order.maxTakeAwayTime;
        }
        if (orderType === "dine_in" && order.maxDineInTime && order.maxDineInTime > 0) {
            return order.maxDineInTime;
        }
        if (order.maxDeliveryTime && order.maxDeliveryTime > 0) {
            return order.maxDeliveryTime;
        }
        if (order.durationOrderPreparing && order.durationOrderPreparing > 0) {
            return order.durationOrderPreparing;
        }
    }

    if (order.durationOrderPreparing && order.durationOrderPreparing > 0) {
        return order.durationOrderPreparing;
    }
    if (order.maxDeliveryTime && order.maxDeliveryTime > 0) {
        return order.maxDeliveryTime;
    }

    // No valid duration configured -> do not auto-deliver
    return null;
}

/**
 * Core function that checks and auto-delivers overdue orders in batches.
 */
export async function processAutoDeliverOrders(): Promise<number> {
    const now = new Date();
    // Safety minimum cutoff (orders updated in the last 5 minutes are never eligible, utilizes index)
    const minCutoff = new Date(now.getTime() - 5 * 60 * 1000);

    // Fetch batch of candidate orders joined with restaurant settings
    const candidates = await db
        .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            restaurantId: orders.restaurantId,
            branchId: orders.branchId,
            userId: orders.userId,
            status: orders.status,
            orderType: orders.orderType,
            deliveryManId: orders.deliveryManId,
            shippingCompanyId: orders.shippingCompanyId,
            durationOrderPreparing: orders.durationOrderPreparing,
            updatedAt: orders.updatedAt,
            createdAt: orders.createdAt,
            maxDeliveryTime: restaurantSettings.maxDeliveryTime,
            minDeliveryTime: restaurantSettings.minDeliveryTime,
            maxTakeAwayTime: restaurantSettings.maxTakeAwayTime,
            maxDineInTime: restaurantSettings.maxDineInTime,
        })
        .from(orders)
        .leftJoin(restaurantSettings, eq(orders.restaurantId, restaurantSettings.restaurantId))
        .where(
            and(
                inArray(orders.status, ["preparing", "out_for_delivery"]),
                lt(orders.updatedAt, minCutoff)
            )
        )
        .limit(100);

    if (candidates.length === 0) return 0;

    let deliveredCount = 0;

    for (const order of candidates) {
        try {
            // Determine timeout duration strictly based on order.durationOrderPreparing and restaurantSettings
            const thresholdMinutes = getOrderTimeoutMinutes(order);

            // If neither is configured, skip auto-delivery completely
            if (!thresholdMinutes || thresholdMinutes <= 0) {
                continue;
            }

            const referenceTime = order.updatedAt || order.createdAt || now;
            const elapsedMinutes = Math.floor(
                (now.getTime() - new Date(referenceTime).getTime()) / 60000
            );

            // Skip if the order hasn't exceeded its specific timeout yet
            if (elapsedMinutes < thresholdMinutes) {
                continue;
            }

            let wasDelivered = false;

            await db.transaction(async (tx) => {
                // Ensure idempotency: verify order is still eligible
                const [currentOrder] = await tx
                    .select({ status: orders.status })
                    .from(orders)
                    .where(eq(orders.id, order.id))
                    .limit(1);

                if (!currentOrder || !["preparing", "out_for_delivery"].includes(currentOrder.status as string)) {
                    return;
                }

                // 1. Update order status to 'delivered'
                await tx
                    .update(orders)
                    .set({
                        status: "delivered",
                        shippingStatus: "delivered",
                        deliveredAt: now,
                        updatedAt: now,
                    })
                    .where(eq(orders.id, order.id));

                // 2. Decrement courier active count and mark assignment completed if courier assigned
                if (order.deliveryManId) {
                    await tx
                        .update(deliveryMen)
                        .set({
                            activeOrdersCount: sql`GREATEST(0, ${deliveryMen.activeOrdersCount} - 1)`,
                        })
                        .where(eq(deliveryMen.id, order.deliveryManId));

                    await tx
                        .update(dispatchAssignments)
                        .set({
                            status: "completed",
                            respondedAt: now,
                        })
                        .where(
                            and(
                                eq(dispatchAssignments.orderId, order.id),
                                eq(dispatchAssignments.deliveryManId, order.deliveryManId),
                                eq(dispatchAssignments.status, "active")
                            )
                        );
                }

                // 3. Settle restaurant earnings & commissions in wallet
                await settleDeliveredOrder(order.id, tx);

                // 4. Calculate and award loyalty points
                const items = await tx
                    .select({ foodId: orderItems.foodId, quantity: orderItems.quantity })
                    .from(orderItems)
                    .where(eq(orderItems.orderId, order.id));

                if (items.length > 0 && order.userId && order.restaurantId) {
                    const foodIds = items.map((i) => i.foodId);
                    const foodPoints = await tx
                        .select({ id: food.id, points: food.points })
                        .from(food)
                        .where(inArray(food.id, foodIds));

                    const foodPointsMap = new Map(foodPoints.map((f) => [f.id, f.points ?? 0]));
                    let totalPointsEarned = 0;
                    for (const item of items) {
                        const pointsPerItem = foodPointsMap.get(item.foodId) ?? 0;
                        totalPointsEarned += pointsPerItem * item.quantity;
                    }

                    if (totalPointsEarned > 0) {
                        let [userPointRecord] = await tx
                            .select()
                            .from(userRestaurantPoints)
                            .where(
                                and(
                                    eq(userRestaurantPoints.userId, order.userId),
                                    eq(userRestaurantPoints.restaurantId, order.restaurantId)
                                )
                            )
                            .limit(1);

                        if (!userPointRecord) {
                            const newPointId = uuidv4();
                            await tx.insert(userRestaurantPoints).values({
                                id: newPointId,
                                userId: order.userId,
                                restaurantId: order.restaurantId,
                                points: 0,
                            });
                            [userPointRecord] = await tx
                                .select()
                                .from(userRestaurantPoints)
                                .where(eq(userRestaurantPoints.id, newPointId))
                                .limit(1);
                        }

                        const pointsBefore = userPointRecord.points ?? 0;
                        const pointsAfter = pointsBefore + totalPointsEarned;

                        await tx
                            .update(userRestaurantPoints)
                            .set({ points: pointsAfter, updatedAt: now })
                            .where(eq(userRestaurantPoints.id, userPointRecord.id));

                        await tx.insert(userPointsTransactions).values({
                            id: uuidv4(),
                            userId: order.userId,
                            restaurantId: order.restaurantId,
                            type: "earn",
                            points: totalPointsEarned,
                            balanceBefore: pointsBefore,
                            balanceAfter: pointsAfter,
                            orderId: order.id,
                            note: `Auto-delivered (${thresholdMinutes}m timeout): Earned ${totalPointsEarned} points from order #${order.orderNumber}`,
                            createdAt: now,
                        });
                    }
                }

                wasDelivered = true;
            });

            if (!wasDelivered) continue;

            deliveredCount++;

            // Release courier lock outside transaction
            if (order.deliveryManId) {
                releaseCourierForOrder(order.id, order.deliveryManId).catch((err) => {
                    console.error(`[AutoDeliver:releaseCourier] failed for order ${order.id}:`, err);
                });
            }

            // Send push notification to user
            if (order.userId) {
                sendPushNotification({
                    recipientType: "user",
                    recipientId: order.userId,
                    branchId: order.branchId || null,
                    title: "تم تسليم الطلب | Order Delivered",
                    body: `طلبك رقم #${order.dailyOrderNumber || order.orderNumber} تم تسليمه بنجاح. شكراً لطلبك من كيتو!`,
                    data: {
                        restaurantId: order.restaurantId,
                        branchId: order.branchId || null,
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        dailyOrderNumber: order.dailyOrderNumber,
                        status: "delivered",
                        type: "ORDER_STATUS_UPDATE",
                    },
                }).catch((err) => {
                    console.error(`[AutoDeliver:pushNotification] failed for order ${order.id}:`, err);
                });
            }

            // Real-time WebSocket broadcasts
            const statusPayload = {
                orderId: order.id,
                orderNumber: order.orderNumber,
                dailyOrderNumber: order.dailyOrderNumber,
                status: "delivered",
                updatedAt: now,
            };

            if (order.restaurantId) {
                notifyRestaurant(order.restaurantId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
            }
            notifyOrderTracking(order.id, SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
            notifyAdmins(SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
            if (order.shippingCompanyId) {
                notifyShippingCompany(order.shippingCompanyId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, statusPayload);
            }

            console.log(
                `[AutoDeliver] Order #${order.dailyOrderNumber || order.orderNumber} (${order.id}) auto-marked as delivered after ${elapsedMinutes}m (threshold was ${thresholdMinutes}m).`
            );
        } catch (err: any) {
            console.error(`[AutoDeliver] Failed to auto-deliver order ${order.id}:`, err?.message || err);
        }
    }

    return deliveredCount;
}

/**
 * Initializes the recurring Auto-Deliver Cron Job (Runs every 5 minutes).
 */
export function initAutoDeliverCron() {
    console.log("⏰ Auto-Deliver Cron initialized (Dynamic threshold per order: durationOrderPreparing & restaurantSettings)...");

    cron.schedule("*/5 * * * *", async () => {
        try {
            const count = await processAutoDeliverOrders();
            if (count > 0) {
                console.log(`✅ [AutoDeliverCron] Successfully auto-delivered ${count} stuck orders.`);
            }
        } catch (error) {
            console.error("❌ [AutoDeliverCron] Error executing auto-deliver cron:", error);
        }
    });
}
