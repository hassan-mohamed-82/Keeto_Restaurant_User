"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRestaurantSettings = exports.checkCanEditOrder = exports.checkRestaurantSettings = void 0;
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const BadRequest_1 = require("../Errors/BadRequest");
/**
 * Middleware للتحقق من إعدادات المطعم قبل إنشاء الأوردر
 * يتحقق من:
 * 1. هل المطعم يدعم نوع الأوردر المطلوب (delivery, takeaway, dine_in)
 * 2. هل المطعم مفتوح حالياً
 * 3. هل الأوردر يحقق الحد الأدنى للطلب
 */
const checkRestaurantSettings = async (req, res, next) => {
    try {
        const { restaurantId, orderType, totalAmount } = req.body;
        if (!restaurantId) {
            throw new BadRequest_1.BadRequest("Restaurant ID is required");
        }
        // 1. جلب إعدادات المطعم
        const [settings] = await connection_1.db
            .select()
            .from(schema_1.restaurantSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
            .limit(1);
        if (!settings) {
            throw new BadRequest_1.BadRequest("Restaurant settings not found");
        }
        // 2. التحقق من نوع الأوردر
        if (orderType === "delivery" && !settings.homeDelivery) {
            throw new BadRequest_1.BadRequest("Delivery service is currently disabled for this restaurant");
        }
        if (orderType === "takeaway" && !settings.takeaway) {
            throw new BadRequest_1.BadRequest("Takeaway service is currently disabled for this restaurant");
        }
        if (orderType === "dine_in" && !settings.dineIn) {
            throw new BadRequest_1.BadRequest("Dine-in service is currently disabled for this restaurant");
        }
        // 3. التحقق من الحد الأدنى للطلب
        const minOrderAmount = parseFloat(settings.minOrderAmount || "0");
        const orderTotal = parseFloat(totalAmount || "0");
        if (orderTotal < minOrderAmount) {
            throw new BadRequest_1.BadRequest(`Minimum order amount is ${minOrderAmount}. Your order total is ${orderTotal}`);
        }
        // 4. التحقق من مواعيد العمل (إذا لم يكن المطعم مفتوح دائماً)
        if (!settings.isAlwaysOpen) {
            const now = new Date();
            const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ...
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const schedules = await connection_1.db
                .select()
                .from(schema_1.restaurantSchedules)
                .where((0, drizzle_orm_1.eq)(schema_1.restaurantSchedules.restaurantId, restaurantId));
            const todaySchedule = schedules.find(s => s.dayOfWeek === currentDay);
            if (!todaySchedule) {
                throw new BadRequest_1.BadRequest("Restaurant schedule not configured");
            }
            if (todaySchedule.isOffDay) {
                throw new BadRequest_1.BadRequest("Restaurant is closed today");
            }
            // التحقق من الوقت
            if (todaySchedule.openingTime && todaySchedule.closingTime) {
                if (currentTime < todaySchedule.openingTime || currentTime > todaySchedule.closingTime) {
                    throw new BadRequest_1.BadRequest(`Restaurant is closed. Opening hours: ${todaySchedule.openingTime} - ${todaySchedule.closingTime}`);
                }
            }
        }
        // ✅ كل الشروط تمام، نكمل
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.checkRestaurantSettings = checkRestaurantSettings;
/**
 * Middleware للتحقق من إمكانية تعديل الأوردر
 */
const checkCanEditOrder = async (req, res, next) => {
    try {
        const restaurantId = req.body.restaurantId || req.params.restaurantId;
        if (!restaurantId) {
            throw new BadRequest_1.BadRequest("Restaurant ID is required");
        }
        const [settings] = await connection_1.db
            .select()
            .from(schema_1.restaurantSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
            .limit(1);
        if (!settings || !settings.canEditOrder) {
            throw new BadRequest_1.BadRequest("Order editing is disabled for this restaurant");
        }
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.checkCanEditOrder = checkCanEditOrder;
/**
 * Helper function لجلب إعدادات المطعم (للاستخدام في Controllers)
 */
const getRestaurantSettings = async (restaurantId) => {
    const [settings] = await connection_1.db
        .select()
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId))
        .limit(1);
    return settings || null;
};
exports.getRestaurantSettings = getRestaurantSettings;
