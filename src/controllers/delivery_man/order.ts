import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    orders,
    orderItems,
    deliveryMen,
    users,
    paymentMethods,
    food,
    dispatchAssignments,
} from "../../models/schema";
import { eq, and, inArray, desc, gte, lte, sql } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import { NotFound } from "../../Errors/NotFound";
import { excludeUnpaidVisaOrders, parseShippingAddress } from "../../helpers/order.helper";
import { sendPushNotification } from "../../utils/notifications";
import { settleDeliveredOrder } from "../../services/restaurantWalletService";
import { rejectOrderByCourier } from "../../services/shipping/dispatchEngine";
import { notifyShippingCompany, notifyOrderTracking } from "../../services/socket/socketService";
import { SOCKET_EVENTS } from "../../services/socket/socketEvents";

// ==========================================
// GET /delivery-man/orders/assigned
// Get all active orders assigned to this delivery man
// Optional query: ?orderId=<uuid> to get details of a specific order
// ==========================================
export const getAssignedOrders = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const deliveryManId = req.user.id;
    const restaurantId = req.user.restaurantId;

    const { orderId } = req.query as { orderId?: string };

    const activeStatuses = ["pending", "accepted", "preparing", "out_for_delivery"] as const;

    // If orderId is provided, return full details of that specific order
    if (orderId) {
        const [order] = await db
            .select({
                id: orders.id,
                orderNumber: orders.orderNumber,
                dailyOrderNumber: orders.dailyOrderNumber,
                status: orders.status,
                shippingStatus: orders.shippingStatus,
                orderType: orders.orderType,
                orderSource: orders.orderSource,
                subtotal: orders.subtotal,
                deliveryFee: orders.deliveryFee,
                serviceFee: orders.serviceFee,
                discountAmount: orders.discountAmount,
                totalAmount: orders.totalAmount,
                paymentMethod: orders.paymentMethod,
                paymentMethodName: paymentMethods.name,
                paymentMethodNameAr: paymentMethods.nameAr,
                paymentStatus: orders.paymentStatus,
                note: orders.note,
                shippingAddress: orders.shippingAddress,
                branchSnapshot: orders.branchSnapshot,
                isCashCollected: orders.isCashCollected,
                cashCollectedAt: orders.cashCollectedAt,
                deliveryManId: orders.deliveryManId,
                shippingCompanyId: orders.shippingCompanyId,
                shippingAssignedAt: orders.shippingAssignedAt,
                pickedUpAt: orders.pickedUpAt,
                deliveredAt: orders.deliveredAt,
                durationOrderPreparing: orders.durationOrderPreparing,
                cancelReason: orders.cancelReason,
                cancelReasonType: orders.cancelReasonType,
                // Customer info
                customerId: users.id,
                customerName: users.name,
                customerPhone: users.phone,
                createdAt: orders.createdAt,
                updatedAt: orders.updatedAt,
            })
            .from(orders)
            .leftJoin(users, eq(orders.userId, users.id))
            .leftJoin(paymentMethods, eq(orders.paymentMethod, paymentMethods.id))
            .where(
                and(
                    eq(orders.id, orderId),
                    eq(orders.deliveryManId, deliveryManId),
                    restaurantId ? eq(orders.restaurantId, restaurantId) : undefined,
                    excludeUnpaidVisaOrders()
                )
            )
            .limit(1);

        if (!order) throw new NotFound("Order not found or not assigned to you");

        // Fetch order items with food name
        const items = await db
            .select({
                id: orderItems.id,
                foodId: orderItems.foodId,
                foodName: food.name,
                foodNameAr: food.nameAr,
                foodImage: food.image,
                quantity: orderItems.quantity,
                basePrice: orderItems.basePrice,
                variationsPrice: orderItems.variationsPrice,
                addonsPrice: orderItems.addonsPrice,
                totalPrice: orderItems.totalPrice,
                variations: orderItems.variations,
                addons: orderItems.addons,
                note: orderItems.note,
            })
            .from(orderItems)
            .leftJoin(food, eq(orderItems.foodId, food.id))
            .where(eq(orderItems.orderId, orderId));

        return SuccessResponse(res, {
            message: "Order details fetched successfully",
            data: {
                ...order,
                shippingAddress: parseShippingAddress(order.shippingAddress),
                items,
            },
        });
    }

    // Otherwise return all active assigned orders (list view)
    const assignedOrders = await db
        .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            status: orders.status,
            shippingStatus: orders.shippingStatus,
            orderType: orders.orderType,
            totalAmount: orders.totalAmount,
            deliveryFee: orders.deliveryFee,
            paymentMethod: orders.paymentMethod,
            paymentMethodName: paymentMethods.name,
            paymentMethodNameAr: paymentMethods.nameAr,
            note: orders.note,
            shippingAddress: orders.shippingAddress,
            shippingCompanyId: orders.shippingCompanyId,
            shippingAssignedAt: orders.shippingAssignedAt,
            pickedUpAt: orders.pickedUpAt,
            durationOrderPreparing: orders.durationOrderPreparing,
            // Customer info
            customerId: users.id,
            customerName: users.name,
            customerPhone: users.phone,
            createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(paymentMethods, eq(orders.paymentMethod, paymentMethods.id))
        .where(
            and(
                eq(orders.deliveryManId, deliveryManId),
                restaurantId ? eq(orders.restaurantId, restaurantId) : undefined,
                eq(orders.orderType, "delivery"),
                inArray(orders.status, [...activeStatuses]),
                excludeUnpaidVisaOrders()
            )
        )
        .orderBy(desc(orders.createdAt));

    return SuccessResponse(res, {
        message: "Assigned orders fetched successfully",
        total: assignedOrders.length,
        data: assignedOrders.map((o) => ({
            ...o,
            shippingAddress: parseShippingAddress(o.shippingAddress),
        })),
    });
};

// ==========================================
// GET /delivery-man/orders/history
// Get history of completed/cancelled orders for this delivery man
// ==========================================
export const getOrderHistory = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const deliveryManId = req.user.id;
    const restaurantId = req.user.restaurantId;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const status = (req.query.status as string) || "all";
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const historyStatuses = ["delivered", "cancelled", "refund"] as const;
    const targetStatuses =
        status !== "all" && historyStatuses.includes(status as any)
            ? [status as (typeof historyStatuses)[number]]
            : [...historyStatuses];

    const conditions: any[] = [
        eq(orders.deliveryManId, deliveryManId),
        restaurantId ? eq(orders.restaurantId, restaurantId) : undefined,
        eq(orders.orderType, "delivery"),
        inArray(orders.status, targetStatuses),
        excludeUnpaidVisaOrders(),
    ].filter(Boolean);

    if (startDate) {
        conditions.push(gte(orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(orders.createdAt, end));
    }

    const historyOrders = await db
        .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            status: orders.status,
            shippingStatus: orders.shippingStatus,
            orderType: orders.orderType,
            totalAmount: orders.totalAmount,
            deliveryFee: orders.deliveryFee,
            paymentMethod: orders.paymentMethod,
            paymentMethodName: paymentMethods.name,
            paymentMethodNameAr: paymentMethods.nameAr,
            isCashCollected: orders.isCashCollected,
            cashCollectedAt: orders.cashCollectedAt,
            cancelReason: orders.cancelReason,
            shippingAddress: orders.shippingAddress,
            pickedUpAt: orders.pickedUpAt,
            deliveredAt: orders.deliveredAt,
            // Customer info
            customerId: users.id,
            customerName: users.name,
            customerPhone: users.phone,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(paymentMethods, eq(orders.paymentMethod, paymentMethods.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset);

    return SuccessResponse(res, {
        message: "Order history fetched successfully",
        page,
        limit,
        total: historyOrders.length,
        data: historyOrders.map((o) => ({
            ...o,
            shippingAddress: parseShippingAddress(o.shippingAddress),
        })),
    });
};

// ==========================================
// POST /delivery-man/orders/:orderId/picked-up
// Delivery man marks the order as picked up from the restaurant/branch
// ==========================================
export const markOrderPickedUp = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const deliveryManId = req.user.id;
    const { orderId } = req.params;

    const [order] = await db
        .select()
        .from(orders)
        .where(
            and(
                eq(orders.id, orderId),
                eq(orders.deliveryManId, deliveryManId),
                req.user.restaurantId ? eq(orders.restaurantId, req.user.restaurantId) : undefined
            )
        )
        .limit(1);

    if (!order) {
        throw new NotFound("Order not found or not assigned to you");
    }

    if (order.status === "out_for_delivery" || order.shippingStatus === "picked_up") {
        throw new BadRequest("Order has already been picked up");
    }

    if (["delivered", "cancelled", "refund", "failed"].includes(order.status as string)) {
        throw new BadRequest(`Order is already ${order.status} and cannot be picked up`);
    }

    const now = new Date();

    await db
        .update(orders)
        .set({
            shippingStatus: "picked_up",
            pickedUpAt: now,
            status: "out_for_delivery",
            updatedAt: now,
        })
        .where(eq(orders.id, orderId));

    if (order.shippingCompanyId) {
        notifyShippingCompany(order.shippingCompanyId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, {
            orderId,
            shippingStatus: "picked_up",
            updatedAt: now,
        });
    }

    notifyOrderTracking(orderId, SOCKET_EVENTS.ORDER_PICKED_UP, {
        orderId,
        courierId: deliveryManId,
        pickedUpAt: now,
    });

    if (order.userId) {
        await sendPushNotification({
            recipientType: "user",
            recipientId: order.userId,
            branchId: order.branchId || null,
            title: "Order Picked Up",
            body: `Your order #${order.dailyOrderNumber || order.orderNumber} is picked up and on the way!`,
            data: {
                restaurantId: order.restaurantId,
                branchId: order.branchId || null,
                orderId: order.id,
                orderNumber: order.orderNumber,
                dailyOrderNumber: order.dailyOrderNumber,
                status: "out_for_delivery",
                shippingStatus: "picked_up",
                type: "ORDER_STATUS_UPDATE",
            },
        });
    }

    return SuccessResponse(res, {
        message: "Order marked as picked up successfully",
    });
};

// ==========================================
// POST /delivery-man/orders/:orderId/delivered
// Delivery man marks the order as delivered
// ==========================================
export const markOrderDelivered = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const deliveryManId = req.user.id;
    const { orderId } = req.params;

    const [existingOrder] = await db
        .select()
        .from(orders)
        .where(
            and(
                eq(orders.id, orderId),
                eq(orders.deliveryManId, deliveryManId),
                req.user.restaurantId ? eq(orders.restaurantId, req.user.restaurantId) : undefined
            )
        )
        .limit(1);

    if (!existingOrder) throw new NotFound("Order not found or not assigned to you");

    const currentStatus = existingOrder.status as string;

    if (currentStatus === "delivered" || existingOrder.shippingStatus === "delivered") {
        throw new BadRequest("Order is already delivered");
    }

    if (["cancelled", "refund", "failed"].includes(currentStatus)) {
        throw new BadRequest(`Order is already ${currentStatus} and cannot be changed`);
    }

    const now = new Date();

    await db.transaction(async (tx) => {
        // 1. Update order status and shipping status
        await tx
            .update(orders)
            .set({
                status: "delivered",
                shippingStatus: "delivered",
                deliveredAt: now,
                updatedAt: now,
            })
            .where(eq(orders.id, orderId));

        // 2. Decrement courier activeOrdersCount
        await tx
            .update(deliveryMen)
            .set({
                activeOrdersCount: sql`GREATEST(0, ${deliveryMen.activeOrdersCount} - 1)`,
            })
            .where(eq(deliveryMen.id, deliveryManId));

        // 3. Mark dispatch assignment completed
        await tx
            .update(dispatchAssignments)
            .set({
                status: "completed",
                respondedAt: now,
            })
            .where(
                and(
                    eq(dispatchAssignments.orderId, orderId),
                    eq(dispatchAssignments.deliveryManId, deliveryManId),
                    eq(dispatchAssignments.status, "active")
                )
            );

        // 4. Settle restaurant earnings via shared service
        await settleDeliveredOrder(orderId, tx);
    });

    if (existingOrder.shippingCompanyId) {
        notifyShippingCompany(existingOrder.shippingCompanyId, SOCKET_EVENTS.ORDER_STATUS_CHANGED, {
            orderId,
            shippingStatus: "delivered",
            updatedAt: now,
        });
    }

    notifyOrderTracking(orderId, SOCKET_EVENTS.ORDER_DELIVERED, {
        orderId,
        courierId: deliveryManId,
        deliveredAt: now,
    });

    if (existingOrder.userId) {
        await sendPushNotification({
            recipientType: "user",
            recipientId: existingOrder.userId,
            branchId: existingOrder.branchId || null,
            title: "Order Delivered",
            body: `Your order #${existingOrder.dailyOrderNumber || existingOrder.orderNumber} has been delivered successfully!`,
            data: {
                restaurantId: existingOrder.restaurantId,
                branchId: existingOrder.branchId || null,
                orderId: existingOrder.id,
                orderNumber: existingOrder.orderNumber,
                dailyOrderNumber: existingOrder.dailyOrderNumber,
                status: "delivered",
                shippingStatus: "delivered",
                type: "ORDER_STATUS_UPDATE",
            },
        });
    }

    return SuccessResponse(res, {
        message: "Order has been marked as delivered successfully",
    });
};

// ==========================================
// PATCH /delivery-man/orders/:orderId/status
// Backward compatibility wrapper for delivery man setting delivered status
// ==========================================
export const updateOrderStatusToDelivered = async (req: Request, res: Response) => {
    const { status } = req.body;
    if (status !== "delivered") {
        throw new BadRequest("Delivery man can only update order status to 'delivered'");
    }
    return markOrderDelivered(req, res);
};

// ==========================================
// POST /delivery-man/orders/:orderId/reject
// Delivery man rejects an assigned order with mandatory reason
// ==========================================
export const rejectOrderCourierEndpoint = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const deliveryManId = req.user.id;
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim() === "") {
        throw new BadRequest("Reject reason is mandatory");
    }

    const [order] = await db
        .select()
        .from(orders)
        .where(
            and(
                eq(orders.id, orderId),
                eq(orders.deliveryManId, deliveryManId)
            )
        )
        .limit(1);

    if (!order) {
        throw new NotFound("Order not found or not assigned to you");
    }

    if (order.status === "delivered" || order.status === "cancelled") {
        throw new BadRequest(`Cannot reject order that is already ${order.status}`);
    }

    const result = await rejectOrderByCourier(orderId, deliveryManId, reason);

    return SuccessResponse(res, {
        message: "Order rejected and re-dispatch initiated",
        data: result,
    });
};
