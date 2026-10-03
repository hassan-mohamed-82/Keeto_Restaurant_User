"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboard = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const Errors_1 = require("../../Errors");
const order_helper_1 = require("../../helpers/order.helper");
const dayjs_1 = __importDefault(require("dayjs"));
// ==========================================
// GET /delivery-man/dashboard
// Summary: cashOnHand, totalAssignedOrders, deliveredOrders, cancelled/refund orders
// ==========================================
const getDashboard = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const restaurantId = req.user.restaurantId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing");
    // Parse period/date filters from query
    const { startDate, endDate, period } = req.query;
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, deliveryManId),
        (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId),
        (0, drizzle_orm_1.eq)(schema_1.orders.orderType, "delivery"),
        (0, order_helper_1.excludeUnpaidVisaOrders)(),
    ];
    // Apply date filtering
    if (startDate) {
        conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, new Date(startDate)));
    }
    else if (period) {
        const now = (0, dayjs_1.default)();
        if (period === "today") {
            conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, now.startOf("day").toDate()));
        }
        else if (period === "this_week") {
            conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, now.startOf("week").toDate()));
        }
        else if (period === "this_month") {
            conditions.push((0, drizzle_orm_1.gte)(schema_1.orders.createdAt, now.startOf("month").toDate()));
        }
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push((0, drizzle_orm_1.lte)(schema_1.orders.createdAt, end));
    }
    // Fetch all relevant orders
    const allOrders = await connection_1.db
        .select({
        id: schema_1.orders.id,
        status: schema_1.orders.status,
        totalAmount: schema_1.orders.totalAmount,
        paymentMethod: schema_1.orders.paymentMethod,
        paymentMethodName: schema_1.paymentMethods.name,
        paymentMethodNameAr: schema_1.paymentMethods.nameAr,
        isCashCollected: schema_1.orders.isCashCollected,
        createdAt: schema_1.orders.createdAt,
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.paymentMethods, (0, drizzle_orm_1.eq)(schema_1.orders.paymentMethod, schema_1.paymentMethods.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    const checkIsCash = (name, nameAr, raw) => {
        const n = (name || "").toLowerCase();
        const nar = (nameAr || "");
        const r = (raw || "").toLowerCase();
        return (n.includes("cash") ||
            nar.includes("استلام") ||
            nar.includes("كاش") ||
            r.includes("cash") ||
            r.includes("استلام"));
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
                }
                else {
                    totalCashCollected += amount; // Already handed over
                }
            }
        }
        if (order.status === "cancelled" || order.status === "refund") {
            cancelledRefundOrdersCount++;
        }
    }
    return (0, response_1.SuccessResponse)(res, {
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
exports.getDashboard = getDashboard;
