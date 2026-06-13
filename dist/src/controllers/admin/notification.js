"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.getMyNotifications = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const NotFound_1 = require("../../Errors/NotFound");
// ==========================================
// 1. Get Restaurant Notifications
// ==========================================
const getMyNotifications = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    // Both restaurant owner and subadmins/managers belong to a restaurantId
    const restaurantId = req.user.restaurantId || req.user.id;
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    // Fetching notifications from DB
    const restaurantNotifications = await connection_1.db
        .select()
        .from(schema_1.notifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "restaurant"), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientId, restaurantId)))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.notifications.createdAt))
        .limit(limit)
        .offset(offset);
    // 1. Format the notifications (Parse stringified JSON)
    const formattedNotifications = restaurantNotifications.map((notif) => {
        let parsedData = null;
        if (notif.data) {
            try {
                // تحويل الـ String لـ JSON Object
                parsedData = typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data;
            }
            catch (error) {
                console.error(`[NOTIFICATIONS] Failed to parse data for notification ${notif.id}`);
                parsedData = notif.data; // Fallback in case of invalid JSON
            }
        }
        return {
            ...notif,
            data: parsedData, // استخدام الداتا بعد التحويل
        };
    });
    // 2. Return clean response structure
    // افتراضاً إن الـ SuccessResponse بياخد الـ Payload بالشكل ده
    return (0, response_1.SuccessResponse)(res, {
        message: "Notifications fetched successfully",
        data: formattedNotifications, // الـ Array بتاع الإشعارات مباشرة
        pagination: {
            page,
            limit
        }
    });
};
exports.getMyNotifications = getMyNotifications;
// ==========================================
// 2. Mark Notification as Read
// ==========================================
const markNotificationAsRead = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    const { id } = req.params;
    const [notification] = await connection_1.db
        .select()
        .from(schema_1.notifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notifications.id, id), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientId, restaurantId)))
        .limit(1);
    if (!notification)
        throw new NotFound_1.NotFound("Notification not found");
    await connection_1.db.update(schema_1.notifications)
        .set({ isRead: true })
        .where((0, drizzle_orm_1.eq)(schema_1.notifications.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Notification marked as read" });
};
exports.markNotificationAsRead = markNotificationAsRead;
// ==========================================
// 3. Mark All Notifications as Read
// ==========================================
const markAllNotificationsAsRead = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    await connection_1.db.update(schema_1.notifications)
        .set({ isRead: true })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "restaurant"), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.notifications.isRead, false)));
    return (0, response_1.SuccessResponse)(res, { message: "All notifications marked as read" });
};
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
