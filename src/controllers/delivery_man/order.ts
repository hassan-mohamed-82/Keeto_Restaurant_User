import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    orders,
    orderItems,
    deliveryMen,
    users,
    paymentMethods,
    food,
} from "../../models/schema";
import { eq, and, inArray, desc, gte, lte } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import { NotFound } from "../../Errors/NotFound";
import { excludeUnpaidVisaOrders, parseShippingAddress } from "../../helpers/order.helper";
import { sendPushNotification } from "../../utils/notifications";
import { settleDeliveredOrder } from "../../services/restaurantWalletService";

// ==========================================
// GET /delivery-man/orders/assigned
// Get all active orders assigned to this delivery man
// Optional query: ?orderId=<uuid> to get details of a specific order
// ==========================================
export const getAssignedOrders = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const deliveryManId = req.user.id;
    const restaurantId = req.user.restaurantId;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

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
                    eq(orders.restaurantId, restaurantId),
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
            orderType: orders.orderType,
            totalAmount: orders.totalAmount,
            paymentMethod: orders.paymentMethod,
            paymentMethodName: paymentMethods.name,
            paymentMethodNameAr: paymentMethods.nameAr,
            note: orders.note,
            shippingAddress: orders.shippingAddress,
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
                eq(orders.restaurantId, restaurantId),
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
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

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
        eq(orders.restaurantId, restaurantId),
        eq(orders.orderType, "delivery"),
        inArray(orders.status, targetStatuses),
        excludeUnpaidVisaOrders(),
    ];

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
// PATCH /delivery-man/orders/:orderId/status
// Delivery man can ONLY set status to "delivered"
// ==========================================
export const updateOrderStatusToDelivered = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const deliveryManId = req.user.id;
    const restaurantId = req.user.restaurantId;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { orderId } = req.params;
    const { status } = req.body;

    // Delivery man can only mark as delivered
    if (status !== "delivered") {
        throw new BadRequest("Delivery man can only update order status to 'delivered'");
    }

    // Fetch order and verify ownership
    const [existingOrder] = await db
        .select()
        .from(orders)
        .where(
            and(
                eq(orders.id, orderId),
                eq(orders.deliveryManId, deliveryManId),
                eq(orders.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existingOrder) throw new NotFound("Order not found or not assigned to you");

    const currentStatus = existingOrder.status as string;

    // Only allow transitioning from out_for_delivery
    if (currentStatus === "delivered") {
        throw new BadRequest("Order is already delivered");
    }

    if (["cancelled", "refund", "failed"].includes(currentStatus)) {
        throw new BadRequest(`Order is already ${currentStatus} and cannot be changed`);
    }

    if (currentStatus !== "out_for_delivery") {
        throw new BadRequest(`Cannot mark order as delivered from status '${currentStatus}'. Order must be 'out_for_delivery' first.`);
    }

    // Update order status and trigger settlement
    await db.transaction(async (tx) => {
        await tx
            .update(orders)
            .set({ status: "delivered", updatedAt: new Date() })
            .where(eq(orders.id, orderId));

        // Settle financial accounts (restaurant wallet, etc.)
        await settleDeliveredOrder(orderId, tx);
    });

    // Send push notification to customer
    await sendPushNotification({
        recipientType: "user",
        recipientId: existingOrder.userId,
        branchId: existingOrder.branchId || null,
        title: "Order Delivered",
        body: `Your order #${existingOrder.dailyOrderNumber} has been delivered successfully!`,
        data: {
            restaurantId: existingOrder.restaurantId,
            branchId: existingOrder.branchId || null,
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            dailyOrderNumber: existingOrder.dailyOrderNumber,
            status: "delivered",
            type: "ORDER_STATUS_UPDATE",
        },
    });

    return SuccessResponse(res, {
        message: "Order has been marked as delivered successfully",
    });
};
