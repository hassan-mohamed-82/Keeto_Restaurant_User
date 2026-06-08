import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restaurantRatings, users } from "../../models/schema";
import { eq, sql, desc } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";

// ==========================================
// 1. جلب كل التقييمات الخاصة بمطعمي
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
        }
    })
        .from(restaurantRatings)
        .leftJoin(users, eq(restaurantRatings.userId, users.id))
        .where(eq(restaurantRatings.restaurantId, restaurantId))
        .orderBy(desc(restaurantRatings.createdAt));

    return SuccessResponse(res, { message: "Get ratings success", data: ratings });
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
