import { Request, Response, NextFunction } from 'express';
import { db } from '../models/connection';
import { restaurantSettings, restaurantSchedules } from '../models/schema';
import { eq } from 'drizzle-orm';
import { BadRequest } from '../Errors/BadRequest';

/**
 * Middleware للتحقق من إعدادات المطعم قبل إنشاء الأوردر
 * يتحقق من:
 * 1. هل المطعم يدعم نوع الأوردر المطلوب (delivery, takeaway, dine_in)
 * 2. هل المطعم مفتوح حالياً
 * 3. هل الأوردر يحقق الحد الأدنى للطلب
 */
export const checkRestaurantSettings = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const { restaurantId, orderType, totalAmount } = req.body;

        if (!restaurantId) {
            throw new BadRequest("Restaurant ID is required");
        }

        // 1. جلب إعدادات المطعم
        const [settings] = await db
            .select()
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, restaurantId))
            .limit(1);

        if (!settings) {
            throw new BadRequest("Restaurant settings not found");
        }

        // 2. التحقق من نوع الأوردر
        if (orderType === "delivery" && !settings.homeDelivery) {
            throw new BadRequest("Delivery service is currently disabled for this restaurant");
        }

        if (orderType === "takeaway" && !settings.takeaway) {
            throw new BadRequest("Takeaway service is currently disabled for this restaurant");
        }

        if (orderType === "dine_in" && !settings.dineIn) {
            throw new BadRequest("Dine-in service is currently disabled for this restaurant");
        }

        // 3. التحقق من الحد الأدنى للطلب
        const minOrderAmount = parseFloat(settings.minOrderAmount || "0");
        const orderTotal = parseFloat(totalAmount || "0");

        if (orderTotal < minOrderAmount) {
            throw new BadRequest(
                `Minimum order amount is ${minOrderAmount}. Your order total is ${orderTotal}`
            );
        }

        // 4. التحقق من مواعيد العمل (إذا لم يكن المطعم مفتوح دائماً)
        if (!settings.isAlwaysOpen) {
            const now = new Date();
            const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ...
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            const schedules = await db
                .select()
                .from(restaurantSchedules)
                .where(eq(restaurantSchedules.restaurantId, restaurantId));

            const todaySchedule = schedules.find(s => s.dayOfWeek === currentDay);

            if (!todaySchedule) {
                throw new BadRequest("Restaurant schedule not configured");
            }

            if (todaySchedule.isOffDay) {
                throw new BadRequest("Restaurant is closed today");
            }

            // التحقق من الوقت
            if (todaySchedule.openingTime && todaySchedule.closingTime) {
                if (currentTime < todaySchedule.openingTime || currentTime > todaySchedule.closingTime) {
                    throw new BadRequest(
                        `Restaurant is closed. Opening hours: ${todaySchedule.openingTime} - ${todaySchedule.closingTime}`
                    );
                }
            }
        }

        // ✅ كل الشروط تمام، نكمل
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Middleware للتحقق من إمكانية تعديل الأوردر
 */
export const checkCanEditOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const restaurantId = req.body.restaurantId || req.params.restaurantId;

        if (!restaurantId) {
            throw new BadRequest("Restaurant ID is required");
        }

        const [settings] = await db
            .select()
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, restaurantId))
            .limit(1);

        if (!settings || !settings.canEditOrder) {
            throw new BadRequest("Order editing is disabled for this restaurant");
        }

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Helper function لجلب إعدادات المطعم (للاستخدام في Controllers)
 */
export const getRestaurantSettings = async (restaurantId: string) => {
    const [settings] = await db
        .select()
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, restaurantId))
        .limit(1);

    return settings || null;
};
