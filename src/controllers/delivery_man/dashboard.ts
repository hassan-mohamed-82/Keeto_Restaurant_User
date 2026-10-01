import { Request, Response } from "express";
import { db } from "../../models/connection";
import { deliveryMen, orders, paymentMethods } from "../../models/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import { excludeUnpaidVisaOrders } from "../../helpers/order.helper";
import dayjs from "dayjs";

// ==========================================
// GET /delivery-man/dashboard
// Summary: cashOnHand, totalAssignedOrders, deliveredOrders, cancelled/refund orders
// ==========================================
export const getDashboard = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const deliveryManId = req.user.id;
    const restaurantId = req.user.restaurantId;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    // Parse period/date filters from query
    const { startDate, endDate, period } = req.query as {
        startDate?: string;
        endDate?: string;
        period?: "today" | "this_week" | "this_month" | "all";
    };

    const conditions: any[] = [
        eq(orders.deliveryManId, deliveryManId),
        eq(orders.restaurantId, restaurantId),
        eq(orders.orderType, "delivery"),
        excludeUnpaidVisaOrders(),
    ];

    // Apply date filtering
    if (startDate) {
        conditions.push(gte(orders.createdAt, new Date(startDate)));
    } else if (period) {
        const now = dayjs();
        if (period === "today") {
            conditions.push(gte(orders.createdAt, now.startOf("day").toDate()));
        } else if (period === "this_week") {
            conditions.push(gte(orders.createdAt, now.startOf("week").toDate()));
        } else if (period === "this_month") {
            conditions.push(gte(orders.createdAt, now.startOf("month").toDate()));
        }
    }

    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(orders.createdAt, end));
    }

    // Fetch all relevant orders
    const allOrders = await db
        .select({
            id: orders.id,
            status: orders.status,
            totalAmount: orders.totalAmount,
            paymentMethod: orders.paymentMethod,
            paymentMethodName: paymentMethods.name,
            paymentMethodNameAr: paymentMethods.nameAr,
            isCashCollected: orders.isCashCollected,
            createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(paymentMethods, eq(orders.paymentMethod, paymentMethods.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

    const checkIsCash = (name?: string | null, nameAr?: string | null, raw?: string | null) => {
        const n = (name || "").toLowerCase();
        const nar = (nameAr || "");
        const r = (raw || "").toLowerCase();
        return (
            n.includes("cash") ||
            nar.includes("استلام") ||
            nar.includes("كاش") ||
            r.includes("cash") ||
            r.includes("استلام")
        );
    };

    // Active statuses (not yet delivered/cancelled)
    const activeStatuses = ["pending", "accepted", "preparing", "out_for_delivery"];
    const terminalStatuses = ["delivered", "cancelled", "refund"];

    let totalAssignedOrders = 0;
    let deliveredOrdersCount = 0;
    let cancelledRefundOrdersCount = 0;
    let cashOnHand = 0; // Cash with delivery man (delivered, cash payment, NOT yet collected)
    let totalCashCollected = 0; // Cash already handed over to restaurant

    for (const order of allOrders) {
        const amount = parseFloat(order.totalAmount ?? "0");
        const isCash = checkIsCash(order.paymentMethodName, order.paymentMethodNameAr, order.paymentMethod);
        const isCashCollected = Boolean(order.isCashCollected);

        if (activeStatuses.includes(order.status ?? "")) {
            totalAssignedOrders++;
        }

        if (order.status === "delivered") {
            deliveredOrdersCount++;
            if (isCash) {
                if (!isCashCollected) {
                    cashOnHand += amount; // Still with delivery man
                } else {
                    totalCashCollected += amount; // Already handed over
                }
            }
        }

        if (order.status === "cancelled" || order.status === "refund") {
            cancelledRefundOrdersCount++;
        }
    }

    return SuccessResponse(res, {
        message: "Dashboard summary fetched successfully",
        data: {
            totalAssignedOrders,
            deliveredOrdersCount,
            cancelledRefundOrdersCount,
            cashOnHand: cashOnHand.toFixed(2),
            totalCashCollected: totalCashCollected.toFixed(2),
        },
    });
};
