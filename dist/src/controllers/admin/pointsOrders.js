"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approveRedeemCode = exports.getOrderByRedeemCode = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const response_1 = require("../../utils/response");
const getRestaurantId = (req) => {
    const id = req.user?.restaurantId || req.user?.id;
    if (!id)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    return id;
};
const getOrderByRedeemCode = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { code } = req.params;
    if (!code)
        throw new BadRequest_1.BadRequest("Redeem code is required");
    // 1. Find pending order matching code and restaurant
    const [order] = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        status: schema_1.orders.status,
        redeemCode: schema_1.orders.redeemCode,
        redeemCodeExpiresAt: schema_1.orders.redeemCodeExpiresAt,
        createdAt: schema_1.orders.createdAt,
        userName: schema_1.users.name,
        userPhone: schema_1.users.phone
    })
        .from(schema_1.orders)
        .innerJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.redeemCode, code), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.orders.isPointsRedeemed, true)))
        .limit(1);
    if (!order) {
        throw new NotFound_1.NotFound("Invalid code or order not found for this restaurant");
    }
    const isExpired = order.redeemCodeExpiresAt && new Date() > new Date(order.redeemCodeExpiresAt);
    const items = await connection_1.db
        .select({
        foodId: schema_1.food.id,
        foodName: schema_1.food.name,
        foodImage: schema_1.food.image,
        quantity: schema_1.orderItems.quantity
    })
        .from(schema_1.orderItems)
        .innerJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, order.orderId));
    return (0, response_1.SuccessResponse)(res, {
        message: "Redemption order fetched successfully",
        data: {
            ...order,
            isExpired,
            items
        }
    });
};
exports.getOrderByRedeemCode = getOrderByRedeemCode;
const approveRedeemCode = async (req, res) => {
    const restaurantId = getRestaurantId(req);
    const { code } = req.body;
    if (!code)
        throw new BadRequest_1.BadRequest("Redeem code is required");
    // 1. Fetch pending order
    const [order] = await connection_1.db
        .select()
        .from(schema_1.orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.redeemCode, code), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.orders.isPointsRedeemed, true)))
        .limit(1);
    if (!order) {
        throw new NotFound_1.NotFound("Invalid code or order not found");
    }
    if (order.status !== "pending") {
        throw new BadRequest_1.BadRequest(`Order code has already been processed or is in status: ${order.status}`);
    }
    if (order.redeemCodeExpiresAt && new Date() > new Date(order.redeemCodeExpiresAt)) {
        throw new BadRequest_1.BadRequest("Redeem code has expired. Codes are only valid for 3 minutes.");
    }
    // 2. Update order status to 'preparing'
    await connection_1.db
        .update(schema_1.orders)
        .set({
        status: "preparing",
        updatedAt: new Date()
    })
        .where((0, drizzle_orm_1.eq)(schema_1.orders.id, order.id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Redeem code approved successfully. Order status updated to preparing.",
        data: {
            orderId: order.id,
            status: "preparing"
        }
    });
};
exports.approveRedeemCode = approveRedeemCode;
