"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerRatingsInShift = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const order_helper_1 = require("../../helpers/order.helper");
// ==========================================
// GET /orders/customer-ratings
// جلب كل العملاء الذين قيّموا في شيفت المطعم الحالي
// مع دعم فلتر ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ==========================================
const getCustomerRatingsInShift = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // بناء شروط التاريخ بناءً على شيفت المطعم أو الفلتر اليدوي
    const dateConditions = await (0, order_helper_1.buildOrderDateConditions)(req, restaurantId);
    // نجيب الأوردرات التي عليها تقييم فقط
    const ratedOrders = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        orderNumber: schema_1.orders.dailyOrderNumber,
        orderCreatedAt: schema_1.orders.createdAt,
        orderTotalAmount: schema_1.orders.totalAmount,
        orderStatus: schema_1.orders.status,
        rating: schema_1.orders.rating,
        ratingComment: schema_1.orders.ratingComment,
        customer: {
            id: schema_1.users.id,
            name: schema_1.users.name,
            email: schema_1.users.email,
            phone: schema_1.users.phone,
            photo: schema_1.users.photo,
        },
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.orders.userId, schema_1.users.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.isNotNull)(schema_1.orders.rating), ...dateConditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    // تجميع الأوردرات لكل عميل
    const customerMap = new Map();
    for (const row of ratedOrders) {
        if (!row.customer?.id || row.rating === null || row.rating === undefined)
            continue;
        const customerId = row.customer.id;
        if (!customerMap.has(customerId)) {
            customerMap.set(customerId, {
                customer: {
                    id: row.customer.id,
                    name: row.customer.name ?? "",
                    email: row.customer.email ?? null,
                    phone: row.customer.phone ?? null,
                    photo: row.customer.photo ?? null,
                },
                totalOrders: 0,
                averageRating: 0,
                orders: [],
            });
        }
        const entry = customerMap.get(customerId);
        entry.orders.push({
            orderId: row.orderId,
            orderNumber: row.orderNumber,
            orderCreatedAt: row.orderCreatedAt,
            orderTotalAmount: row.orderTotalAmount,
            orderStatus: row.orderStatus,
            rating: row.rating,
            ratingComment: row.ratingComment ?? null,
        });
    }
    // حساب المتوسط لكل عميل
    const result = Array.from(customerMap.values()).map((entry) => {
        const totalRating = entry.orders.reduce((sum, o) => sum + o.rating, 0);
        entry.totalOrders = entry.orders.length;
        entry.averageRating = parseFloat((totalRating / entry.orders.length).toFixed(1));
        return entry;
    });
    // إحصائيات عامة
    const totalRatedOrders = ratedOrders.length;
    const overallAverage = totalRatedOrders > 0
        ? parseFloat((ratedOrders.reduce((sum, o) => sum + (o.rating ?? 0), 0) /
            totalRatedOrders).toFixed(1))
        : 0;
    return (0, response_1.SuccessResponse)(res, {
        message: "Get customer ratings in shift success",
        data: {
            summary: {
                totalRatedOrders,
                totalUniqueCustomers: result.length,
                overallAverageRating: overallAverage,
            },
            customers: result,
        },
    });
};
exports.getCustomerRatingsInShift = getCustomerRatingsInShift;
