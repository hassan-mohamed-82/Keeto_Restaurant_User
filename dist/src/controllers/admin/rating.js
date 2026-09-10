"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyRatingModerationRequests = exports.createRatingModerationRequest = exports.getMyRestaurantRatingStats = exports.getMyRestaurantRatings = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
// ==========================================
// 1. جلب كل التقييمات الخاصة بمطعمي مع حالة طلب التعديل/الحذف إن وجد
// ==========================================
const getMyRestaurantRatings = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const ratings = await connection_1.db.select({
        id: schema_1.restaurantRatings.id,
        rating: schema_1.restaurantRatings.rating,
        comment: schema_1.restaurantRatings.comment,
        createdAt: schema_1.restaurantRatings.createdAt,
        customer: {
            id: schema_1.users.id,
            name: schema_1.users.name,
            photo: schema_1.users.photo,
            phone: schema_1.users.phone,
            alternativePhone: schema_1.users.alternatePhone,
        }
    })
        .from(schema_1.restaurantRatings)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.restaurantRatings.userId, schema_1.users.id))
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantRatings.restaurantId, restaurantId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.restaurantRatings.createdAt));
    // إحضار آخر طلبات تعديل/حذف مرتبطة بهذه التقييمات
    const ratingIds = ratings.map(r => r.id);
    let requestsMap = {};
    if (ratingIds.length > 0) {
        const requests = await connection_1.db
            .select({
            id: schema_1.ratingRequests.id,
            ratingId: schema_1.ratingRequests.ratingId,
            targetType: schema_1.ratingRequests.targetType,
            requestType: schema_1.ratingRequests.requestType,
            newRating: schema_1.ratingRequests.newRating,
            newComment: schema_1.ratingRequests.newComment,
            reason: schema_1.ratingRequests.reason,
            status: schema_1.ratingRequests.status,
            adminNotes: schema_1.ratingRequests.adminNotes,
            createdAt: schema_1.ratingRequests.createdAt,
            resolvedAt: schema_1.ratingRequests.resolvedAt,
        })
            .from(schema_1.ratingRequests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ratingRequests.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.ratingRequests.targetType, "restaurant"), (0, drizzle_orm_1.inArray)(schema_1.ratingRequests.ratingId, ratingIds)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.ratingRequests.createdAt));
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
    return (0, response_1.SuccessResponse)(res, { message: "Get ratings success", data: enrichedRatings });
};
exports.getMyRestaurantRatings = getMyRestaurantRatings;
// ==========================================
// 2. إحصائيات التقييمات (Rating Stats)
// ==========================================
const getMyRestaurantRatingStats = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    // إجمالي التقييمات والمتوسط
    const [summary] = await connection_1.db.select({
        totalRatings: (0, drizzle_orm_1.sql) `COUNT(*)`,
        averageRating: (0, drizzle_orm_1.sql) `ROUND(AVG(${schema_1.restaurantRatings.rating}), 1)`,
    })
        .from(schema_1.restaurantRatings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantRatings.restaurantId, restaurantId));
    // توزيع النجوم (كم واحد ادى 5 نجوم، كم واحد ادى 4، الخ)
    const distribution = await connection_1.db.select({
        rating: schema_1.restaurantRatings.rating,
        count: (0, drizzle_orm_1.sql) `COUNT(*)`,
    })
        .from(schema_1.restaurantRatings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantRatings.restaurantId, restaurantId))
        .groupBy(schema_1.restaurantRatings.rating)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.restaurantRatings.rating));
    // بناء التوزيع كامل من 1 لـ 5 (حتى لو مفيش تقييمات لنجمة معينة)
    const fullDistribution = [5, 4, 3, 2, 1].map(star => {
        const found = distribution.find(d => d.rating === star);
        return { rating: star, count: found ? found.count : 0 };
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Get rating stats success",
        data: {
            totalRatings: summary.totalRatings || 0,
            averageRating: summary.averageRating || "0.0",
            distribution: fullDistribution
        }
    });
};
exports.getMyRestaurantRatingStats = getMyRestaurantRatingStats;
// ==========================================
// 3. تقديم طلب تعديل أو حذف تقييم/تعليق (Restaurant Request)
// يتيح للمطعم اختيار نوع التقييم:
// - targetType = 'restaurant' (تقييم المطعم العام)
// - targetType = 'order' (تقييم أوردر محدد)
// ==========================================
const createRatingModerationRequest = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const { targetType, ratingId, orderId, requestType, newRating, newComment, reason } = req.body;
    // ─── التحقق من وجود التقييم وتبعياته ───
    if (targetType === "restaurant") {
        const [existingRating] = await connection_1.db
            .select()
            .from(schema_1.restaurantRatings)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantRatings.id, ratingId), (0, drizzle_orm_1.eq)(schema_1.restaurantRatings.restaurantId, restaurantId)))
            .limit(1);
        if (!existingRating) {
            throw new NotFound_1.NotFound("Restaurant rating not found or does not belong to your restaurant");
        }
        // التحقق من عدم وجود طلب معلق مسبقاً لنفس التقييم
        const [pendingRequest] = await connection_1.db
            .select()
            .from(schema_1.ratingRequests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ratingRequests.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.ratingRequests.targetType, "restaurant"), (0, drizzle_orm_1.eq)(schema_1.ratingRequests.ratingId, ratingId), (0, drizzle_orm_1.eq)(schema_1.ratingRequests.status, "pending")))
            .limit(1);
        if (pendingRequest) {
            throw new BadRequest_1.BadRequest("A pending moderation request already exists for this restaurant rating");
        }
    }
    else if (targetType === "order") {
        const [existingOrder] = await connection_1.db
            .select({
            id: schema_1.orders.id,
            restaurantId: schema_1.orders.restaurantId,
            rating: schema_1.orders.rating,
            ratingComment: schema_1.orders.ratingComment,
        })
            .from(schema_1.orders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId), (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId)))
            .limit(1);
        if (!existingOrder) {
            throw new NotFound_1.NotFound("Order not found or does not belong to your restaurant");
        }
        if (existingOrder.rating === null && existingOrder.ratingComment === null) {
            throw new BadRequest_1.BadRequest("This order does not have any rating or comment to moderate");
        }
        // التحقق من عدم وجود طلب معلق مسبقاً لنفس الأوردر
        const [pendingRequest] = await connection_1.db
            .select()
            .from(schema_1.ratingRequests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.ratingRequests.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.ratingRequests.targetType, "order"), (0, drizzle_orm_1.eq)(schema_1.ratingRequests.orderId, orderId), (0, drizzle_orm_1.eq)(schema_1.ratingRequests.status, "pending")))
            .limit(1);
        if (pendingRequest) {
            throw new BadRequest_1.BadRequest("A pending moderation request already exists for this order rating");
        }
    }
    const requestId = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.ratingRequests).values({
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
    return (0, response_1.SuccessResponse)(res, {
        message: "Rating moderation request submitted successfully and is pending SuperAdmin review",
        data: {
            id: requestId,
            targetType,
            requestType,
            status: "pending",
        }
    }, 201);
};
exports.createRatingModerationRequest = createRatingModerationRequest;
// ==========================================
// 4. جلب قائمة طلبات تعديل/حذف التقييمات الخاصة بالمطعم
// ==========================================
const getMyRatingModerationRequests = async (req, res) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID missing or unauthorized");
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const status = req.query.status || "all";
    const targetType = req.query.targetType || "restaurant";
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.ratingRequests.restaurantId, restaurantId)];
    if (status && status !== "all") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.ratingRequests.status, status));
    }
    if (targetType && targetType !== "all") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.ratingRequests.targetType, targetType));
    }
    const [totalData] = await connection_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(schema_1.ratingRequests)
        .where((0, drizzle_orm_1.and)(...conditions));
    const total = Number(totalData.count);
    const totalPages = Math.ceil(total / limit);
    const requests = await connection_1.db
        .select({
        id: schema_1.ratingRequests.id,
        targetType: schema_1.ratingRequests.targetType,
        requestType: schema_1.ratingRequests.requestType,
        ratingId: schema_1.ratingRequests.ratingId,
        orderId: schema_1.ratingRequests.orderId,
        newRating: schema_1.ratingRequests.newRating,
        newComment: schema_1.ratingRequests.newComment,
        reason: schema_1.ratingRequests.reason,
        status: schema_1.ratingRequests.status,
        adminNotes: schema_1.ratingRequests.adminNotes,
        resolvedAt: schema_1.ratingRequests.resolvedAt,
        createdAt: schema_1.ratingRequests.createdAt,
        // بيانات تقييم المطعم إن وجد
        restaurantRating: {
            id: schema_1.restaurantRatings.id,
            rating: schema_1.restaurantRatings.rating,
            comment: schema_1.restaurantRatings.comment,
        },
        // بيانات الأوردر إن وجد
        order: {
            id: schema_1.orders.id,
            orderNumber: schema_1.orders.dailyOrderNumber,
            rating: schema_1.orders.rating,
            ratingComment: schema_1.orders.ratingComment,
        },
    })
        .from(schema_1.ratingRequests)
        .leftJoin(schema_1.restaurantRatings, (0, drizzle_orm_1.eq)(schema_1.ratingRequests.ratingId, schema_1.restaurantRatings.id))
        .leftJoin(schema_1.orders, (0, drizzle_orm_1.eq)(schema_1.ratingRequests.orderId, schema_1.orders.id))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.ratingRequests.createdAt))
        .limit(limit)
        .offset(offset);
    return (0, response_1.SuccessResponse)(res, {
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
exports.getMyRatingModerationRequests = getMyRatingModerationRequests;
