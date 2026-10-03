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
// GET /delivery-man/notifications
// ==========================================
const getMyNotifications = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const unreadOnly = req.query.unreadOnly === "true";
    const isReadParam = req.query.isRead;
    const conditions = [
        (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "delivery_man"), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "restaurant")),
        (0, drizzle_orm_1.eq)(schema_1.notifications.recipientId, deliveryManId),
    ];
    if (unreadOnly || isReadParam === "false") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.notifications.isRead, false));
    }
    else if (isReadParam === "true") {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.notifications.isRead, true));
    }
    const myNotifications = await connection_1.db
        .select()
        .from(schema_1.notifications)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.notifications.createdAt))
        .limit(limit)
        .offset(offset);
    // Count unread
    const allForUnread = await connection_1.db
        .select({ id: schema_1.notifications.id })
        .from(schema_1.notifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "delivery_man"), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "restaurant")), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientId, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.notifications.isRead, false)));
    return (0, response_1.SuccessResponse)(res, {
        message: "Notifications fetched successfully",
        page,
        limit,
        unreadCount: allForUnread.length,
        data: myNotifications,
    });
};
exports.getMyNotifications = getMyNotifications;
// ==========================================
// PATCH /delivery-man/notifications/:id/read
// ==========================================
const markNotificationAsRead = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const { id } = req.params;
    const [notification] = await connection_1.db
        .select()
        .from(schema_1.notifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notifications.id, id), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "delivery_man"), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "restaurant")), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientId, deliveryManId)))
        .limit(1);
    if (!notification)
        throw new NotFound_1.NotFound("Notification not found");
    await connection_1.db
        .update(schema_1.notifications)
        .set({ isRead: true })
        .where((0, drizzle_orm_1.eq)(schema_1.notifications.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Notification marked as read" });
};
exports.markNotificationAsRead = markNotificationAsRead;
// ==========================================
// PATCH /delivery-man/notifications/read-all
// ==========================================
const markAllNotificationsAsRead = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    await connection_1.db
        .update(schema_1.notifications)
        .set({ isRead: true })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "delivery_man"), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "restaurant")), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientId, deliveryManId), (0, drizzle_orm_1.eq)(schema_1.notifications.isRead, false)));
    return (0, response_1.SuccessResponse)(res, { message: "All notifications marked as read" });
};
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
