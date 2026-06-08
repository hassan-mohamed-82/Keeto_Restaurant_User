"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyRestaurantRatingStats = exports.getMyRestaurantRatings = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
// ==========================================
// 1. جلب كل التقييمات الخاصة بمطعمي
// ==========================================
const getMyRestaurantRatings = async (req, res) => {
    const restaurantId = req.user?.id || req.user?.restaurantId;
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
        }
    })
        .from(schema_1.restaurantRatings)
        .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.restaurantRatings.userId, schema_1.users.id))
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantRatings.restaurantId, restaurantId))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.restaurantRatings.createdAt));
    return (0, response_1.SuccessResponse)(res, { message: "Get ratings success", data: ratings });
};
exports.getMyRestaurantRatings = getMyRestaurantRatings;
// ==========================================
// 2. إحصائيات التقييمات (Rating Stats)
// ==========================================
const getMyRestaurantRatingStats = async (req, res) => {
    const restaurantId = req.user?.id || req.user?.restaurantId;
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
