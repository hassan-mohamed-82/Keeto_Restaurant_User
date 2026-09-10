import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restaurantRatings, users, ratingRequests, orders } from "../../models/schema";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// 1. جلب كل التقييمات الخاصة بمطعمي مع حالة طلب التعديل/الحذف إن وجد
// ==========================================
export const getMyRestaurantRatings = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const ratings = await db.select({
        id: restaurantRatings.id,
        rating: restaurantRatings.rating,
        comment: restaurantRatings.comment,
        createdAt: restaurantRatings.createdAt,
        customer: {
            id: users.id,
            name: users.name,
            photo: users.photo,
            phone: users.phone,
            alternativePhone: users.alternatePhone,
        }
    })
        .from(restaurantRatings)
        .leftJoin(users, eq(restaurantRatings.userId, users.id))
        .where(eq(restaurantRatings.restaurantId, restaurantId))
        .orderBy(desc(restaurantRatings.createdAt));

    // إحضار آخر طلبات تعديل/حذف مرتبطة بهذه التقييمات
    const ratingIds = ratings.map(r => r.id);
    let requestsMap: Record<string, any> = {};

    if (ratingIds.length > 0) {
        const requests = await db
            .select({
                id: ratingRequests.id,
                ratingId: ratingRequests.ratingId,
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
                    eq(ratingRequests.targetType, "restaurant"),
                    inArray(ratingRequests.ratingId, ratingIds)
                )
            )
            .orderBy(desc(ratingRequests.createdAt));

        for (const reqItem of requests) {
            if (reqItem.ratingId && !requestsMap[reqItem.ratingId]) {
                requestsMap[reqItem.ratingId] = reqItem;
            }
        }
    }

    const enrichedRatings = ratings.map(r => ({
        ...r,
        latestRequest: requestsMap[r.id] || null,
    }));

    return SuccessResponse(res, { message: "Get ratings success", data: enrichedRatings });
};

// ==========================================
// 2. إحصائيات التقييمات (Rating Stats)
// ==========================================
export const getMyRestaurantRatingStats = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    // إجمالي التقييمات والمتوسط
    const [summary] = await db.select({
        totalRatings: sql<number>`COUNT(*)`,
        averageRating: sql<string>`ROUND(AVG(${restaurantRatings.rating}), 1)`,
    })
        .from(restaurantRatings)
        .where(eq(restaurantRatings.restaurantId, restaurantId));

    // توزيع النجوم (كم واحد ادى 5 نجوم، كم واحد ادى 4، الخ)
    const distribution = await db.select({
        rating: restaurantRatings.rating,
        count: sql<number>`COUNT(*)`,
    })
        .from(restaurantRatings)
        .where(eq(restaurantRatings.restaurantId, restaurantId))
        .groupBy(restaurantRatings.rating)
        .orderBy(desc(restaurantRatings.rating));

    // بناء التوزيع كامل من 1 لـ 5 (حتى لو مفيش تقييمات لنجمة معينة)
    const fullDistribution = [5, 4, 3, 2, 1].map(star => {
        const found = distribution.find(d => d.rating === star);
        return { rating: star, count: found ? found.count : 0 };
    });

    return SuccessResponse(res, {
        message: "Get rating stats success",
        data: {
            totalRatings: summary.totalRatings || 0,
            averageRating: summary.averageRating || "0.0",
            distribution: fullDistribution
        }
    });
};

// ==========================================
// 3. تقديم طلب تعديل أو حذف تقييم/تعليق (Restaurant Request)
// يتيح للمطعم اختيار نوع التقييم:
// - targetType = 'restaurant' (تقييم المطعم العام)
// - targetType = 'order' (تقييم أوردر محدد)
// ==========================================
export const createRatingModerationRequest = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const { targetType, ratingId, orderId, requestType, newRating, newComment, reason } = req.body;

    // ─── التحقق من وجود التقييم وتبعياته ───
    if (targetType === "restaurant") {
        const [existingRating] = await db
            .select()
            .from(restaurantRatings)
            .where(
                and(
                    eq(restaurantRatings.id, ratingId),
                    eq(restaurantRatings.restaurantId, restaurantId)
                )
            )
            .limit(1);

        if (!existingRating) {
            throw new NotFound("Restaurant rating not found or does not belong to your restaurant");
        }

        // التحقق من عدم وجود طلب معلق مسبقاً لنفس التقييم
        const [pendingRequest] = await db
            .select()
            .from(ratingRequests)
            .where(
                and(
                    eq(ratingRequests.restaurantId, restaurantId),
                    eq(ratingRequests.targetType, "restaurant"),
                    eq(ratingRequests.ratingId, ratingId),
                    eq(ratingRequests.status, "pending")
                )
            )
            .limit(1);

        if (pendingRequest) {
            throw new BadRequest("A pending moderation request already exists for this restaurant rating");
        }
    } else if (targetType === "order") {
        const [existingOrder] = await db
            .select({
                id: orders.id,
                restaurantId: orders.restaurantId,
                rating: orders.rating,
                ratingComment: orders.ratingComment,
            })
            .from(orders)
            .where(
                and(
                    eq(orders.id, orderId),
                    eq(orders.restaurantId, restaurantId)
                )
            )
            .limit(1);

        if (!existingOrder) {
            throw new NotFound("Order not found or does not belong to your restaurant");
        }

        if (existingOrder.rating === null && existingOrder.ratingComment === null) {
            throw new BadRequest("This order does not have any rating or comment to moderate");
        }

        // التحقق من عدم وجود طلب معلق مسبقاً لنفس الأوردر
        const [pendingRequest] = await db
            .select()
            .from(ratingRequests)
            .where(
                and(
                    eq(ratingRequests.restaurantId, restaurantId),
                    eq(ratingRequests.targetType, "order"),
                    eq(ratingRequests.orderId, orderId),
                    eq(ratingRequests.status, "pending")
                )
            )
            .limit(1);

        if (pendingRequest) {
            throw new BadRequest("A pending moderation request already exists for this order rating");
        }
    }

    const requestId = uuidv4();
    await db.insert(ratingRequests).values({
        id: requestId,
        restaurantId,
        targetType: targetType,
        ratingId: targetType === "restaurant" ? ratingId : null,
        orderId: targetType === "order" ? orderId : null,
        requestType,
        newRating: requestType === "edit" ? (newRating ?? null) : null,
        newComment: requestType === "edit" ? (newComment ?? null) : null,
        reason,
        status: "pending",
    });

    return SuccessResponse(res, {
        message: "Rating moderation request submitted successfully and is pending SuperAdmin review",
        data: {
            id: requestId,
            targetType,
            requestType,
            status: "pending",
        }
    }, 201);
};

// ==========================================
// 4. جلب قائمة طلبات تعديل/حذف التقييمات الخاصة بالمطعم
// ==========================================
export const getMyRatingModerationRequests = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const status = (req.query.status as string) || "all";
    const targetType = (req.query.targetType as string) || "restaurant";

    const conditions: any[] = [eq(ratingRequests.restaurantId, restaurantId)];

    if (status && status !== "all") {
        conditions.push(eq(ratingRequests.status, status as any));
    }
    if (targetType && targetType !== "all") {
        conditions.push(eq(ratingRequests.targetType, targetType as any));
    }

    const [totalData] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ratingRequests)
        .where(and(...conditions));

    const total = Number(totalData.count);
    const totalPages = Math.ceil(total / limit);

    const requests = await db
        .select({
            id: ratingRequests.id,
            targetType: ratingRequests.targetType,
            requestType: ratingRequests.requestType,
            ratingId: ratingRequests.ratingId,
            orderId: ratingRequests.orderId,
            newRating: ratingRequests.newRating,
            newComment: ratingRequests.newComment,
            reason: ratingRequests.reason,
            status: ratingRequests.status,
            adminNotes: ratingRequests.adminNotes,
            resolvedAt: ratingRequests.resolvedAt,
            createdAt: ratingRequests.createdAt,
            // بيانات تقييم المطعم إن وجد
            restaurantRating: {
                id: restaurantRatings.id,
                rating: restaurantRatings.rating,
                comment: restaurantRatings.comment,
            },
            // بيانات الأوردر إن وجد
            order: {
                id: orders.id,
                orderNumber: orders.dailyOrderNumber,
                rating: orders.rating,
                ratingComment: orders.ratingComment,
            },
        })
        .from(ratingRequests)
        .leftJoin(restaurantRatings, eq(ratingRequests.ratingId, restaurantRatings.id))
        .leftJoin(orders, eq(ratingRequests.orderId, orders.id))
        .where(and(...conditions))
        .orderBy(desc(ratingRequests.createdAt))
        .limit(limit)
        .offset(offset);

    return SuccessResponse(res, {
        message: "Rating moderation requests fetched successfully",
        data: requests,
        pagination: {
            total,
            page,
            limit,
            totalPages,
        }
    });
};

