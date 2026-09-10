import { Request, Response } from "express";
import { db } from "../../models/connection";
import { orders, users, ratingRequests } from "../../models/schema";
import { eq, and, isNotNull, desc, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { buildOrderDateConditions } from "../../helpers/order.helper";

// ==========================================
// GET /orders/customer-ratings
// جلب كل العملاء الذين قيّموا في شيفت المطعم الحالي
// مع دعم فلتر ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// ==========================================
export const getCustomerRatingsInShift = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    // بناء شروط التاريخ بناءً على شيفت المطعم أو الفلتر اليدوي
    const dateConditions = await buildOrderDateConditions(req, restaurantId);

    // نجيب الأوردرات التي عليها تقييم فقط
    const ratedOrders = await db
        .select({
            orderId: orders.id,
            orderNumber: orders.dailyOrderNumber,
            orderCreatedAt: orders.createdAt,
            orderTotalAmount: orders.totalAmount,
            orderStatus: orders.status,
            rating: orders.rating,
            ratingComment: orders.ratingComment,
            customer: {
                id: users.id,
                name: users.name,
                email: users.email,
                phone: users.phone,
                photo: users.photo,
            },
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .where(
            and(
                eq(orders.restaurantId, restaurantId),
                isNotNull(orders.rating),
                ...dateConditions
            )
        )
        .orderBy(desc(orders.createdAt));

    // إحضار آخر طلبات تعديل/حذف مرتبطة بهذه الأوردرات
    const orderIds = ratedOrders.map(o => o.orderId);
    let orderRequestsMap: Record<string, any> = {};

    if (orderIds.length > 0) {
        const requests = await db
            .select({
                id: ratingRequests.id,
                orderId: ratingRequests.orderId,
                targetType: ratingRequests.targetType,
                requestType: ratingRequests.requestType,
                newRating: ratingRequests.newRating,
                newComment: ratingRequests.newComment,
                reason: ratingRequests.reason,
                status: ratingRequests.status,
                adminNotes: ratingRequests.adminNotes,
                createdAt: ratingRequests.createdAt,
                resolvedAt: ratingRequests.resolvedAt,
            })
            .from(ratingRequests)
            .where(
                and(
                    eq(ratingRequests.restaurantId, restaurantId),
                    eq(ratingRequests.targetType, "order"),
                    inArray(ratingRequests.orderId, orderIds)
                )
            )
            .orderBy(desc(ratingRequests.createdAt));

        for (const reqItem of requests) {
            if (reqItem.orderId && !orderRequestsMap[reqItem.orderId]) {
                orderRequestsMap[reqItem.orderId] = reqItem;
            }
        }
    }

    // تجميع الأوردرات لكل عميل
    const customerMap = new Map<
        string,
        {
            customer: { id: string; name: string; email: string | null; phone: string | null; photo: string | null };
            totalOrders: number;
            averageRating: number;
            orders: Array<{
                orderId: string;
                orderNumber: number | null;
                orderCreatedAt: Date | null;
                orderTotalAmount: string;
                orderStatus: string | null;
                rating: number;
                ratingComment: string | null;
                latestRequest: any | null;
            }>;
        }
    >();

    for (const row of ratedOrders) {
        if (!row.customer?.id || row.rating === null || row.rating === undefined) continue;

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

        const entry = customerMap.get(customerId)!;
        entry.orders.push({
            orderId: row.orderId,
            orderNumber: row.orderNumber,
            orderCreatedAt: row.orderCreatedAt,
            orderTotalAmount: row.orderTotalAmount,
            orderStatus: row.orderStatus,
            rating: row.rating,
            ratingComment: row.ratingComment ?? null,
            latestRequest: orderRequestsMap[row.orderId] || null,
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
    const overallAverage =
        totalRatedOrders > 0
            ? parseFloat(
                  (
                      ratedOrders.reduce((sum, o) => sum + (o.rating ?? 0), 0) /
                      totalRatedOrders
                  ).toFixed(1)
              )
            : 0;

    return SuccessResponse(res, {
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
