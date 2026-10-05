"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderStatusToDelivered = exports.getOrderHistory = exports.getAssignedOrders = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const Errors_1 = require("../../Errors");
const NotFound_1 = require("../../Errors/NotFound");
const order_helper_1 = require("../../helpers/order.helper");
const notifications_1 = require("../../utils/notifications");
const restaurantWalletService_1 = require("../../services/restaurantWalletService");
// ==========================================
// GET /delivery-man/orders/assigned
// Get all active orders assigned to this delivery man
// Optional query: ?orderId=<uuid> to get details of a specific order
// ==========================================
const getAssignedOrders = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const restaurantId = req.user.restaurantId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { orderId } = req.query;
    const activeStatuses = ["pending", "accepted", "preparing", "out_for_delivery"];
    // If orderId is provided, return full details of that specific order
    if (orderId) {
        const [order] = await connection_1.db
            .select({
            id: schema_1.orders.id,
            orderNumber: schema_1.orders.orderNumber,
            dailyOrderNumber: schema_1.orders.dailyOrderNumber,
            status: schema_1.orders.status,
            orderType: schema_1.orders.orderType,
            orderSource: schema_1.orders.orderSource,
            subtotal: schema_1.orders.subtotal,
            deliveryFee: schema_1.orders.deliveryFee,
            serviceFee: schema_1.orders.serviceFee,
            discountAmount: schema_1.orders.discountAmount,
            totalAmount: schema_1.orders.totalAmount,
            paymentMethod: schema_1.orders.paymentMethod,
            paymentMethodName: schema_1.paymentMethods.name,
            paymentMethodNameAr: schema_1.paymentMethods.nameAr,
            paymentStatus: schema_1.orders.paymentStatus,
            note: schema_1.orders.note,
            shippingAddress: schema_1.orders.shippingAddress,
            branchSnapshot: schema_1.orders.branchSnapshot,
            isCashCollected: schema_1.orders.isCashCollected,
            cashCollectedAt: schema_1.orders.cashCollectedAt,
            deliveryManId: schema_1.orders.deliveryManId,
            durationOrderPreparing: schema_1.orders.durationOrderPreparing,
            cancelReason: schema_1.orders.cancelReason,
            cancelReasonType: schema_1.orders.cancelReasonType,
            // Customer info
            customerId: schema_1.users.id,
            customerName: schema_1.users.name,
            customerPhone: schema_1.users.phone,
            createdAt: schema_1.orders.createdAt,
            updatedAt: schema_1.orders.updatedAt,
        })
            .from(schema_1.orders)
            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
            .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId), (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, order_helper_1.excludeUnpaidVisaOrders)()))
            .limit(1);
        if (!order)
            throw new NotFound_1.NotFound("Order not found or not assigned to you");
        // Fetch order items with food name
        const items = await connection_1.db
            .select({
            id: schema_1.orderItems.id,
            foodId: schema_1.orderItems.foodId,
            foodName: schema_1.food.name,
            foodNameAr: schema_1.food.nameAr,
            foodImage: schema_1.food.image,
            quantity: schema_1.orderItems.quantity,
            basePrice: schema_1.orderItems.basePrice,
            variationsPrice: schema_1.orderItems.variationsPrice,
            addonsPrice: schema_1.orderItems.addonsPrice,
            totalPrice: schema_1.orderItems.totalPrice,
            variations: schema_1.orderItems.variations,
            addons: schema_1.orderItems.addons,
            note: schema_1.orderItems.note,
        })
            .from(schema_1.orderItems)
            .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
            .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, orderId));
        return (0, response_1.SuccessResponse)(res, {
            message: "Order details fetched successfully",
            data: {
                ...order,
                shippingAddress: (0, order_helper_1.parseShippingAddress)(order.shippingAddress),
                items,
            },
        });
    }
    // Otherwise return all active assigned orders (list view)
    const assignedOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        status: schema_1.orders.status,
        orderType: schema_1.orders.orderType,
        totalAmount: schema_1.orders.totalAmount,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        note: schema_1.orders.note,
        shippingAddress: schema_1.orders.shippingAddress,
        durationOrderPreparing: schema_1.orders.durationOrderPreparing,
        // Customer info
        customerId: schema_1.users.id,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        createdAt: schema_1.orders.createdAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.orders.orderType, "delivery"), (0, drizzle_orm_1.inArray)(schema_1.orders.status, [...activeStatuses]), (0, order_helper_1.excludeUnpaidVisaOrders)()))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    return (0, response_1.SuccessResponse)(res, {
        message: "Assigned orders fetched successfully",
        total: assignedOrders.length,
        data: assignedOrders.map((o) => ({
            ...o,
            shippingAddress: (0, order_helper_1.parseShippingAddress)(o.shippingAddress),
        })),
    });
};
exports.getAssignedOrders = getAssignedOrders;
// ==========================================
// GET /delivery-man/orders/history
// Get history of completed/cancelled orders for this delivery man
// ==========================================
const getOrderHistory = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const restaurantId = req.user.restaurantId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status || "all";
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const historyStatuses = ["delivered", "cancelled", "refund"];
    const targetStatuses = status !== "all" && historyStatuses.includes(status)
        ? [status]
        : [...historyStatuses];
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId),
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId),
        (0, drizzle_orm_1.eq)(schema_1.orders.orderType, "delivery"),
        (0, drizzle_orm_1.inArray)(schema_1.orders.status, targetStatuses),
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
    ];
    if (startDate) {
        conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push((0, drizzle_orm_1.lte)(schema_1.orders.createdAt, end));
    }
    const historyOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        status: schema_1.orders.status,
        orderType: schema_1.orders.orderType,
        totalAmount: schema_1.orders.totalAmount,
        deliveryFee: schema_1.orders.deliveryFee,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        isCashCollected: schema_1.orders.isCashCollected,
        cashCollectedAt: schema_1.orders.cashCollectedAt,
        cancelReason: schema_1.orders.cancelReason,
        shippingAddress: schema_1.orders.shippingAddress,
        // Customer info
        customerId: schema_1.users.id,
        customerName: schema_1.users.name,
        customerPhone: schema_1.users.phone,
        createdAt: schema_1.orders.createdAt,
        updatedAt: schema_1.orders.updatedAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt))
        .limit(limit)
        .offset(offset);
    return (0, response_1.SuccessResponse)(res, {
        message: "Order history fetched successfully",
        page,
        limit,
        total: historyOrders.length,
        data: historyOrders.map((o) => ({
            ...o,
            shippingAddress: (0, order_helper_1.parseShippingAddress)(o.shippingAddress),
        })),
    });
};
exports.getOrderHistory = getOrderHistory;
// ==========================================
// PATCH /delivery-man/orders/:orderId/status
// Delivery man can ONLY set status to "delivered"
// ==========================================
const updateOrderStatusToDelivered = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const restaurantId = req.user.restaurantId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    const { orderId } = req.params;
    const { status } = req.body;
    // Delivery man can only mark as delivered
    if (status !== "delivered") {
        throw new BadRequest_1.BadRequest("Delivery man can only update order status to 'delivered'");
    }
    // Fetch order and verify ownership
    const [existingOrder] = await connection_1.db
        .select()
        .from(schema_1.orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId), (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId)))
        .limit(1);
    if (!existingOrder)
        throw new NotFound_1.NotFound("Order not found or not assigned to you");
    const currentStatus = existingOrder.status;
    // Only allow transitioning from out_for_delivery
    if (currentStatus === "delivered") {
        throw new BadRequest_1.BadRequest("Order is already delivered");
    }
    if (["cancelled", "refund", "failed"].includes(currentStatus)) {
        throw new BadRequest_1.BadRequest(`Order is already ${currentStatus} and cannot be changed`);
    }
    if (currentStatus !== "out_for_delivery") {
        throw new BadRequest_1.BadRequest(`Cannot mark order as delivered from status '${currentStatus}'. Order must be 'out_for_delivery' first.`);
    }
    // Update order status and trigger settlement
    await connection_1.db.transaction(async (tx) => {
        await tx
            .update(schema_1.orders)
            .set({ status: "delivered", updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId));
        // Settle financial accounts (restaurant wallet, etc.)
        await (0, restaurantWalletService_1.settleDeliveredOrder)(orderId, tx);
    });
    // Send push notification to customer
    await (0, notifications_1.sendPushNotification)({
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
    return (0, response_1.SuccessResponse)(res, {
        message: "Order has been marked as delivered successfully",
    });
};
exports.updateOrderStatusToDelivered = updateOrderStatusToDelivered;
