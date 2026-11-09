"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectOrderCourierEndpoint = exports.updateOrderStatusToDelivered = exports.markOrderDelivered = exports.markOrderPickedUp = exports.getOrderHistory = exports.getAssignedOrders = void 0;
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
const dispatchEngine_1 = require("../../services/shipping/dispatchEngine");
const socketService_1 = require("../../services/socket/socketService");
const socketEvents_1 = require("../../services/socket/socketEvents");
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
            shippingStatus: schema_1.orders.shippingStatus,
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
            shippingCompanyId: schema_1.orders.shippingCompanyId,
            shippingAssignedAt: schema_1.orders.shippingAssignedAt,
            pickedUpAt: schema_1.orders.pickedUpAt,
            deliveredAt: schema_1.orders.deliveredAt,
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
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId), (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId), restaurantId ? (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId) : undefined, (0, order_helper_1.excludeUnpaidVisaOrders)()))
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
        shippingStatus: schema_1.orders.shippingStatus,
        orderType: schema_1.orders.orderType,
        totalAmount: schema_1.orders.totalAmount,
        deliveryFee: schema_1.orders.deliveryFee,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        note: schema_1.orders.note,
        shippingAddress: schema_1.orders.shippingAddress,
        shippingCompanyId: schema_1.orders.shippingCompanyId,
        shippingAssignedAt: schema_1.orders.shippingAssignedAt,
        pickedUpAt: schema_1.orders.pickedUpAt,
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
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId), restaurantId ? (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId) : undefined, (0, drizzle_orm_1.eq)(schema_1.orders.orderType, "delivery"), (0, drizzle_orm_1.inArray)(schema_1.orders.status, [...activeStatuses]), (0, order_helper_1.excludeUnpaidVisaOrders)()))
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
        restaurantId ? (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId) : undefined,
        (0, drizzle_orm_1.eq)(schema_1.orders.orderType, "delivery"),
        (0, drizzle_orm_1.inArray)(schema_1.orders.status, targetStatuses),
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
    ].filter(Boolean);
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
        shippingStatus: schema_1.orders.shippingStatus,
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
        pickedUpAt: schema_1.orders.pickedUpAt,
        deliveredAt: schema_1.orders.deliveredAt,
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
// POST /delivery-man/orders/:orderId/picked-up
// Delivery man marks the order as picked up from the restaurant/branch
// ==========================================
const markOrderPickedUp = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const { orderId } = req.params;
    const [order] = await connection_1.db
        .select()
        .from(schema_1.orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId), (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId), req.user.restaurantId ? (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, req.user.restaurantId) : undefined))
        .limit(1);
    if (!order) {
        throw new NotFound_1.NotFound("Order not found or not assigned to you");
    }
    if (order.status === "out_for_delivery" || order.shippingStatus === "picked_up") {
        throw new BadRequest_1.BadRequest("Order has already been picked up");
    }
    if (["delivered", "cancelled", "refund", "failed"].includes(order.status)) {
        throw new BadRequest_1.BadRequest(`Order is already ${order.status} and cannot be picked up`);
    }
    const now = new Date();
    await connection_1.db
        .update(schema_1.orders)
        .set({
        shippingStatus: "picked_up",
        pickedUpAt: now,
        status: "out_for_delivery",
        updatedAt: now,
    })
        .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId));
    if (order.shippingCompanyId) {
        (0, socketService_1.notifyShippingCompany)(order.shippingCompanyId, socketEvents_1.SOCKET_EVENTS.ORDER_STATUS_CHANGED, {
            orderId,
            shippingStatus: "picked_up",
            updatedAt: now,
        });
    }
    (0, socketService_1.notifyOrderTracking)(orderId, socketEvents_1.SOCKET_EVENTS.ORDER_PICKED_UP, {
        orderId,
        courierId: deliveryManId,
        pickedUpAt: now,
    });
    if (order.userId) {
        await (0, notifications_1.sendPushNotification)({
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
    return (0, response_1.SuccessResponse)(res, {
        message: "Order marked as picked up successfully",
    });
};
exports.markOrderPickedUp = markOrderPickedUp;
// ==========================================
// POST /delivery-man/orders/:orderId/delivered
// Delivery man marks the order as delivered
// ==========================================
const markOrderDelivered = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const { orderId } = req.params;
    const [existingOrder] = await connection_1.db
        .select()
        .from(schema_1.orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId), (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId), req.user.restaurantId ? (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, req.user.restaurantId) : undefined))
        .limit(1);
    if (!existingOrder)
        throw new NotFound_1.NotFound("Order not found or not assigned to you");
    const currentStatus = existingOrder.status;
    if (currentStatus === "delivered" || existingOrder.shippingStatus === "delivered") {
        throw new BadRequest_1.BadRequest("Order is already delivered");
    }
    if (["cancelled", "refund", "failed"].includes(currentStatus)) {
        throw new BadRequest_1.BadRequest(`Order is already ${currentStatus} and cannot be changed`);
    }
    const now = new Date();
    await connection_1.db.transaction(async (tx) => {
        // 1. Update order status and shipping status
        await tx
            .update(schema_1.orders)
            .set({
            status: "delivered",
            shippingStatus: "delivered",
            deliveredAt: now,
            updatedAt: now,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId));
        // 2. Decrement courier activeOrdersCount
        await tx
            .update(schema_1.deliveryMen)
            .set({
            activeOrdersCount: (0, drizzle_orm_1.sql) `GREATEST(0, ${schema_1.deliveryMen.activeOrdersCount} - 1)`,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.deliveryMen.id, deliveryManId));
        // 3. Mark dispatch assignment completed
        await tx
            .update(schema_1.dispatchAssignments)
            .set({
            status: "completed",
            respondedAt: now,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.dispatchAssignments.orderId, orderId), (0, drizzle_orm_1.eq)(schema_1.dispatchAssignments.deliveryManId, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.dispatchAssignments.status, "active")));
        // 4. Settle restaurant earnings via shared service
        await (0, restaurantWalletService_1.settleDeliveredOrder)(orderId, tx);
    });
    if (existingOrder.shippingCompanyId) {
        (0, socketService_1.notifyShippingCompany)(existingOrder.shippingCompanyId, socketEvents_1.SOCKET_EVENTS.ORDER_STATUS_CHANGED, {
            orderId,
            shippingStatus: "delivered",
            updatedAt: now,
        });
    }
    (0, socketService_1.notifyOrderTracking)(orderId, socketEvents_1.SOCKET_EVENTS.ORDER_DELIVERED, {
        orderId,
        courierId: deliveryManId,
        deliveredAt: now,
    });
    if (existingOrder.userId) {
        await (0, notifications_1.sendPushNotification)({
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
    return (0, response_1.SuccessResponse)(res, {
        message: "Order has been marked as delivered successfully",
    });
};
exports.markOrderDelivered = markOrderDelivered;
// ==========================================
// PATCH /delivery-man/orders/:orderId/status
// Backward compatibility wrapper for delivery man setting delivered status
// ==========================================
const updateOrderStatusToDelivered = async (req, res) => {
    const { status } = req.body;
    if (status !== "delivered") {
        throw new BadRequest_1.BadRequest("Delivery man can only update order status to 'delivered'");
    }
    return (0, exports.markOrderDelivered)(req, res);
};
exports.updateOrderStatusToDelivered = updateOrderStatusToDelivered;
// ==========================================
// POST /delivery-man/orders/:orderId/reject
// Delivery man rejects an assigned order with mandatory reason
// ==========================================
const rejectOrderCourierEndpoint = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const { orderId } = req.params;
    const { reason } = req.body;
    if (!reason || reason.trim() === "") {
        throw new BadRequest_1.BadRequest("Reject reason is mandatory");
    }
    const [order] = await connection_1.db
        .select()
        .from(schema_1.orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId), (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId)))
        .limit(1);
    if (!order) {
        throw new NotFound_1.NotFound("Order not found or not assigned to you");
    }
    if (order.status === "delivered" || order.status === "cancelled") {
        throw new BadRequest_1.BadRequest(`Cannot reject order that is already ${order.status}`);
    }
    const result = await (0, dispatchEngine_1.rejectOrderByCourier)(orderId, deliveryManId, reason);
    return (0, response_1.SuccessResponse)(res, {
        message: "Order rejected and re-dispatch initiated",
        data: result,
    });
};
exports.rejectOrderCourierEndpoint = rejectOrderCourierEndpoint;
