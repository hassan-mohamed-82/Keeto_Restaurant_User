"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRepeatNotificationSettings = exports.getRepeatNotificationSettings = exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.getMyNotifications = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const NotFound_1 = require("../../Errors/NotFound");
const BadRequest_1 = require("../../Errors/BadRequest");
// ==========================================
// 1. Get Restaurant Notifications (Filtered by Branch if applicable)
// ==========================================
const getMyNotifications = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId;
    const queryBranchId = req.query.branchId;
    const targetBranchId = adminBranchId || queryBranchId;
    if (!adminRestaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    // Base conditions for this restaurant/branch
    const baseConditions = [
        (0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "restaurant"),
        (0, drizzle_orm_1.eq)(schema_1.notifications.recipientId, adminRestaurantId)
    ];
    if (targetBranchId) {
        baseConditions.push((0, drizzle_orm_1.sql) `(
                JSON_UNQUOTE(JSON_EXTRACT(${schema_1.notifications.data}, '$.branchId')) = ${targetBranchId}
                OR JSON_EXTRACT(${schema_1.notifications.data}, '$.branchId') IS NULL
            )`);
    }
    // Filter conditions for current page view
    const filteredConditions = [...baseConditions];
    const isReadParam = req.query.isRead;
    const unreadOnlyParam = req.query.unreadOnly;
    if (isReadParam === "false" || unreadOnlyParam === "true") {
        filteredConditions.push((0, drizzle_orm_1.eq)(schema_1.notifications.isRead, false));
    }
    else if (isReadParam === "true") {
        filteredConditions.push((0, drizzle_orm_1.eq)(schema_1.notifications.isRead, true));
    }
    else if (req.query.all !== "true") {
        filteredConditions.push((0, drizzle_orm_1.eq)(schema_1.notifications.isRead, false));
    }
    // 🚀 Execute list query, total filtered count, and total unread count in parallel
    const [restaurantNotifications, totalCountResult, unreadCountResult] = await Promise.all([
        connection_1.db
            .select()
            .from(schema_1.notifications)
            .where((0, drizzle_orm_1.and)(...filteredConditions))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.notifications.createdAt))
            .limit(limit)
            .offset(offset),
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.notifications)
            .where((0, drizzle_orm_1.and)(...filteredConditions)),
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.notifications)
            .where((0, drizzle_orm_1.and)(...baseConditions, (0, drizzle_orm_1.eq)(schema_1.notifications.isRead, false)))
    ]);
    const totalCount = Number(totalCountResult[0]?.count || 0);
    const unreadCount = Number(unreadCountResult[0]?.count || 0);
    // Format output
    const formattedNotifications = restaurantNotifications.map((notif) => {
        let parsedData = null;
        if (notif.data) {
            try {
                parsedData = typeof notif.data === "string" ? JSON.parse(notif.data) : notif.data;
            }
            catch (error) {
                parsedData = notif.data;
            }
        }
        return {
            ...notif,
            data: parsedData,
        };
    });
    return (0, response_1.SuccessResponse)(res, {
        message: "Notifications fetched successfully",
        data: formattedNotifications,
        pagination: {
            page,
            limit,
            totalItems: totalCount,
            totalPages: Math.ceil(totalCount / limit),
            unreadCount, // Useful for header badge counters
        }
    });
};
exports.getMyNotifications = getMyNotifications;
// ==========================================
// 2. Read & Delete Notification
// ==========================================
const markNotificationAsRead = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    if (!adminRestaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { id } = req.params;
    const [notification] = await connection_1.db
        .select()
        .from(schema_1.notifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notifications.id, id), (0, drizzle_orm_1.eq)(schema_1.notifications.recipientId, adminRestaurantId)))
        .limit(1);
    if (!notification)
        throw new NotFound_1.NotFound("Notification not found");
    // await db.update(notifications)
    //     .set({ isRead: true })
    //     .where(eq(notifications.id, id));
    await connection_1.db.delete(schema_1.notifications)
        .where((0, drizzle_orm_1.eq)(schema_1.notifications.id, id));
    return (0, response_1.SuccessResponse)(res, { message: "Notification marked as read" });
};
exports.markNotificationAsRead = markNotificationAsRead;
// ==========================================
// 3. Read & Delete All Notifications
// ==========================================
const markAllNotificationsAsRead = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId;
    const queryBranchId = req.query.branchId;
    const targetBranchId = adminBranchId || queryBranchId;
    if (!adminRestaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const conditions = [
        (0, drizzle_orm_1.eq)(schema_1.notifications.recipientType, "restaurant"),
        (0, drizzle_orm_1.eq)(schema_1.notifications.recipientId, adminRestaurantId),
        // eq(notifications.isRead, false)
    ];
    if (targetBranchId) {
        conditions.push((0, drizzle_orm_1.sql) `(
                JSON_UNQUOTE(JSON_EXTRACT(${schema_1.notifications.data}, '$.branchId')) = ${targetBranchId}
                OR JSON_EXTRACT(${schema_1.notifications.data}, '$.branchId') IS NULL
            )`);
    }
    // await db.update(notifications)
    //     .set({ isRead: true })
    //     .where(and(...conditions));
    await connection_1.db.delete(schema_1.notifications)
        .where((0, drizzle_orm_1.and)(...conditions));
    return (0, response_1.SuccessResponse)(res, { message: "All notifications marked as read" });
};
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
// ==========================================
// 4. Get Repeat Notification Settings
// ==========================================
const getRepeatNotificationSettings = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    if (!adminRestaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    let [settings] = await connection_1.db
        .select({
        repeatNotification: schema_1.restaurantSettings.repeatNotification,
        repeatNotificationDuration: schema_1.restaurantSettings.repeatNotificationDuration,
        repeatNotificationStatuses: schema_1.restaurantSettings.repeatNotificationStatuses,
    })
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, adminRestaurantId))
        .limit(1);
    if (!settings) {
        await connection_1.db.insert(schema_1.restaurantSettings).values({ restaurantId: adminRestaurantId });
        [settings] = await connection_1.db
            .select({
            repeatNotification: schema_1.restaurantSettings.repeatNotification,
            repeatNotificationDuration: schema_1.restaurantSettings.repeatNotificationDuration,
            repeatNotificationStatuses: schema_1.restaurantSettings.repeatNotificationStatuses,
        })
            .from(schema_1.restaurantSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, adminRestaurantId))
            .limit(1);
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Repeat notification settings fetched successfully",
        data: {
            repeatNotification: settings?.repeatNotification ?? false,
            repeatNotificationDuration: settings?.repeatNotificationDuration ?? 5,
            repeatNotificationStatuses: settings?.repeatNotificationStatuses ?? ["pending"],
        }
    });
};
exports.getRepeatNotificationSettings = getRepeatNotificationSettings;
// ==========================================
// 5. Update Repeat Notification Settings
// ==========================================
const updateRepeatNotificationSettings = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    if (!adminRestaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { repeatNotification, repeatNotificationDuration, repeatNotificationStatuses } = req.body;
    const updateData = {};
    if (repeatNotification !== undefined)
        updateData.repeatNotification = Boolean(repeatNotification);
    if (repeatNotificationDuration !== undefined)
        updateData.repeatNotificationDuration = Number(repeatNotificationDuration);
    if (repeatNotificationStatuses !== undefined)
        updateData.repeatNotificationStatuses = repeatNotificationStatuses;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, adminRestaurantId))
        .limit(1);
    if (existing) {
        await connection_1.db
            .update(schema_1.restaurantSettings)
            .set(updateData)
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, adminRestaurantId));
    }
    else {
        await connection_1.db
            .insert(schema_1.restaurantSettings)
            .values({
            restaurantId: adminRestaurantId,
            ...updateData,
        });
    }
    const [updatedSettings] = await connection_1.db
        .select({
        repeatNotification: schema_1.restaurantSettings.repeatNotification,
        repeatNotificationDuration: schema_1.restaurantSettings.repeatNotificationDuration,
        repeatNotificationStatuses: schema_1.restaurantSettings.repeatNotificationStatuses,
    })
        .from(schema_1.restaurantSettings)
        .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, adminRestaurantId))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Repeat notification settings updated successfully",
        data: updatedSettings
    });
};
exports.updateRepeatNotificationSettings = updateRepeatNotificationSettings;
