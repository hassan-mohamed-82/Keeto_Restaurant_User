import { Request, Response } from "express";
import { db } from "../../models/connection";
import { orders, orderItems, food, users } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { SuccessResponse } from "../../utils/response";

const getRestaurantId = (req: Request): string => {
    const id = req.user?.restaurantId || req.user?.id;
    if (!id) throw new BadRequest("Restaurant ID missing or unauthorized");
    return id;
};

export const getOrderByRedeemCode = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { code } = req.params;

    if (!code) throw new BadRequest("Redeem code is required");

    // 1. Find pending order matching code and restaurant
    const [order] = await db
        .select({
            orderId: orders.id,
            status: orders.status,
            redeemCode: orders.redeemCode,
            createdAt: orders.createdAt,
            userName: users.name,
            userPhone: users.phone
        })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .where(
            and(
                eq(orders.redeemCode, code),
                eq(orders.restaurantId, restaurantId),
                eq(orders.isPointsRedeemed, true)
            )
        )
        .limit(1);

    if (!order) {
        throw new NotFound("Invalid code or order not found for this restaurant");
    }

    // 2. Get items in this redemption order
    const items = await db
        .select({
            foodId: food.id,
            foodName: food.name,
            foodImage: food.image,
            quantity: orderItems.quantity
        })
        .from(orderItems)
        .innerJoin(food, eq(orderItems.foodId, food.id))
        .where(eq(orderItems.orderId, order.orderId));

    return SuccessResponse(res, {
        message: "Redemption order fetched successfully",
        data: {
            ...order,
            items
        }
    });
};

export const approveRedeemCode = async (req: Request, res: Response) => {
    const restaurantId = getRestaurantId(req);
    const { code } = req.body;

    if (!code) throw new BadRequest("Redeem code is required");

    // 1. Fetch pending order
    const [order] = await db
        .select()
        .from(orders)
        .where(
            and(
                eq(orders.redeemCode, code),
                eq(orders.restaurantId, restaurantId),
                eq(orders.isPointsRedeemed, true)
            )
        )
        .limit(1);

    if (!order) {
        throw new NotFound("Invalid code or order not found");
    }

    if (order.status !== "pending") {
        throw new BadRequest(`Order code has already been processed or is in status: ${order.status}`);
    }

    // 2. Update order status to 'preparing'
    await db
        .update(orders)
        .set({
            status: "preparing",
            updatedAt: new Date()
        })
        .where(eq(orders.id, order.id));

    return SuccessResponse(res, {
        message: "Redeem code approved successfully. Order status updated to preparing.",
        data: {
            orderId: order.id,
            status: "preparing"
        }
    });
};