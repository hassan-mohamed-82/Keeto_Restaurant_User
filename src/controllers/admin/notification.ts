import { Request, Response } from "express";
import { db } from "../../models/connection";
import { notifications, restaurantSettings } from "../../models/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { NotFound } from "../../Errors/NotFound";
import { BadRequest } from "../../Errors/BadRequest";

// ==========================================
// 1. Get Restaurant Notifications (Filtered by Branch if applicable)
// ==========================================
export const getMyNotifications = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId;
    const queryBranchId = req.query.branchId as string | undefined;
    const targetBranchId = adminBranchId || queryBranchId;

    if (!adminRestaurantId) throw new BadRequest("Restaurant ID not found");

    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const conditions: any[] = [
        eq(notifications.recipientType, "restaurant"),
        eq(notifications.recipientId, adminRestaurantId)
    ];

    // ✅ تصفية الإشعارات الخاصة بالفرع إذا كان المستخدم مدير فرع أو محدد branchId
    if (targetBranchId) {
        conditions.push(
            sql`(
                JSON_UNQUOTE(JSON_EXTRACT(${notifications.data}, '$.branchId')) = ${targetBranchId}
                OR JSON_EXTRACT(${notifications.data}, '$.branchId') IS NULL
            )`
        );
    }

    // ✅ عدم إرجاع الإشعارات المقروءة (أو التصفية بحسب isRead / unreadOnly / all)
    const isReadParam = req.query.isRead as string | undefined;
    const unreadOnlyParam = req.query.unreadOnly as string | undefined;

    if (isReadParam === "false" || unreadOnlyParam === "true") {
        conditions.push(eq(notifications.isRead, false));
    } else if (isReadParam === "true") {
        conditions.push(eq(notifications.isRead, true));
    } else if (req.query.all !== "true") {
        // افتراضياً: استبعاد الإشعارات المقروءة (عدم إرجاع الإشعار إذا قُرئ)
        conditions.push(eq(notifications.isRead, false));
    }

    // Fetching notifications from DB
    const restaurantNotifications = await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);
    
    // 1. Format the notifications (Parse stringified JSON)
    const formattedNotifications = restaurantNotifications.map((notif) => {
        let parsedData = null;
        if (notif.data) {
            try {
                parsedData = typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data;
            } catch (error) {
                console.error(`[NOTIFICATIONS] Failed to parse data for notification ${notif.id}`);
                parsedData = notif.data;
            }
        }

        return {
            ...notif,
            data: parsedData,
        };
    });

    return SuccessResponse(res, {
        message: "Notifications fetched successfully",
        data: formattedNotifications,
        pagination: {
            page,
            limit
        }
    });
};

// ==========================================
// 2. Mark Notification as Read
// ==========================================
export const markNotificationAsRead = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const adminRestaurantId = req.user.restaurantId || req.user.id;

    if (!adminRestaurantId) throw new BadRequest("Restaurant ID not found");
    const { id } = req.params;

    const [notification] = await db
        .select()
        .from(notifications)
        .where(and(
            eq(notifications.id, id),
            eq(notifications.recipientId, adminRestaurantId)
        ))
        .limit(1);

    if (!notification) throw new NotFound("Notification not found");

    await db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, id));

    return SuccessResponse(res, { message: "Notification marked as read" });
};

// ==========================================
// 3. Mark All Notifications as Read
// ==========================================
export const markAllNotificationsAsRead = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    
    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId;
    const queryBranchId = req.query.branchId as string | undefined;
    const targetBranchId = adminBranchId || queryBranchId;

    if (!adminRestaurantId) throw new BadRequest("Restaurant ID not found");

    const conditions: any[] = [
        eq(notifications.recipientType, "restaurant"),
        eq(notifications.recipientId, adminRestaurantId),
        eq(notifications.isRead, false)
    ];

    if (targetBranchId) {
        conditions.push(
            sql`(
                JSON_UNQUOTE(JSON_EXTRACT(${notifications.data}, '$.branchId')) = ${targetBranchId}
                OR JSON_EXTRACT(${notifications.data}, '$.branchId') IS NULL
            )`
        );
    }

    await db.update(notifications)
        .set({ isRead: true })
        .where(and(...conditions));

    return SuccessResponse(res, { message: "All notifications marked as read" });
};

// ==========================================
// 4. Get Repeat Notification Settings
// ==========================================
export const getRepeatNotificationSettings = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const adminRestaurantId = req.user.restaurantId || req.user.id;

    if (!adminRestaurantId) throw new BadRequest("Restaurant ID not found");

    let [settings] = await db
        .select({
            repeatNotification: restaurantSettings.repeatNotification,
            repeatNotificationDuration: restaurantSettings.repeatNotificationDuration,
            repeatNotificationInterval: restaurantSettings.repeatNotificationInterval,
            orderAlertNotification: restaurantSettings.orderAlertNotification,
            orderAlertDurationThreshold: restaurantSettings.orderAlertDurationThreshold,
            orderAlertStatuses: restaurantSettings.orderAlertStatuses,
        })
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, adminRestaurantId))
        .limit(1);

    if (!settings) {
        await db.insert(restaurantSettings).values({ restaurantId: adminRestaurantId });
        [settings] = await db
            .select({
                repeatNotification: restaurantSettings.repeatNotification,
                repeatNotificationDuration: restaurantSettings.repeatNotificationDuration,
                repeatNotificationInterval: restaurantSettings.repeatNotificationInterval,
                orderAlertNotification: restaurantSettings.orderAlertNotification,
                orderAlertDurationThreshold: restaurantSettings.orderAlertDurationThreshold,
                orderAlertStatuses: restaurantSettings.orderAlertStatuses,
            })
            .from(restaurantSettings)
            .where(eq(restaurantSettings.restaurantId, adminRestaurantId))
            .limit(1);
    }

    return SuccessResponse(res, {
        message: "Repeat notification settings fetched successfully",
        data: {
            repeatNotification: settings?.repeatNotification ?? false,
            repeatNotificationDuration: settings?.repeatNotificationDuration ?? 5,
            repeatNotificationInterval: settings?.repeatNotificationInterval ?? 60,
            orderAlertNotification: settings?.orderAlertNotification ?? true,
            orderAlertDurationThreshold: settings?.orderAlertDurationThreshold ?? 20,
            orderAlertStatuses: settings?.orderAlertStatuses ?? ["accepted", "preparing", "out_for_delivery"],
        }
    });
};

// ==========================================
// 5. Update Repeat Notification Settings
// ==========================================
export const updateRepeatNotificationSettings = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const adminRestaurantId = req.user.restaurantId || req.user.id;

    if (!adminRestaurantId) throw new BadRequest("Restaurant ID not found");

    const {
        repeatNotification,
        repeatNotificationDuration,
        repeatNotificationInterval,
        orderAlertNotification,
        orderAlertDurationThreshold,
        orderAlertStatuses
    } = req.body;

    const updateData: any = {};
    if (repeatNotification !== undefined) updateData.repeatNotification = Boolean(repeatNotification);
    if (repeatNotificationDuration !== undefined) updateData.repeatNotificationDuration = Number(repeatNotificationDuration);
    if (repeatNotificationInterval !== undefined) updateData.repeatNotificationInterval = Number(repeatNotificationInterval);
    if (orderAlertNotification !== undefined) updateData.orderAlertNotification = Boolean(orderAlertNotification);
    if (orderAlertDurationThreshold !== undefined) updateData.orderAlertDurationThreshold = Number(orderAlertDurationThreshold);
    if (orderAlertStatuses !== undefined) updateData.orderAlertStatuses = orderAlertStatuses;

    const [existing] = await db
        .select()
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, adminRestaurantId))
        .limit(1);

    if (existing) {
        await db
            .update(restaurantSettings)
            .set(updateData)
            .where(eq(restaurantSettings.restaurantId, adminRestaurantId));
    } else {
        await db
            .insert(restaurantSettings)
            .values({
                restaurantId: adminRestaurantId,
                ...updateData,
            });
    }

    const [updatedSettings] = await db
        .select({
            repeatNotification: restaurantSettings.repeatNotification,
            repeatNotificationDuration: restaurantSettings.repeatNotificationDuration,
            repeatNotificationInterval: restaurantSettings.repeatNotificationInterval,
            orderAlertNotification: restaurantSettings.orderAlertNotification,
            orderAlertDurationThreshold: restaurantSettings.orderAlertDurationThreshold,
            orderAlertStatuses: restaurantSettings.orderAlertStatuses,
        })
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, adminRestaurantId))
        .limit(1);

    return SuccessResponse(res, {
        message: "Repeat notification settings updated successfully",
        data: updatedSettings
    });
};




//--
// import { Request, Response } from "express";
// import { db } from "../../models/connection";
// import { notifications } from "../../models/schema";
// import { eq, and, desc } from "drizzle-orm";
// import { SuccessResponse } from "../../utils/response";
// import { UnauthorizedError } from "../../Errors";
// import { NotFound } from "../../Errors/NotFound";
// import { BadRequest } from "../../Errors/BadRequest";
// // ==========================================
// // 1. Get Restaurant Notifications
// // ==========================================
// export const getMyNotifications = async (req: Request | any, res: Response) => {
//     if (!req.user) throw new UnauthorizedError("Unauthenticated");

//     // Both restaurant owner and subadmins/managers belong to a restaurantId
//     const restaurantId = req.user.restaurantId || req.user.branchId;

//     if (!restaurantId) throw new BadRequest("Restaurant ID not found");

//     // Pagination
//     const page = parseInt(req.query.page as string) || 1;
//     const limit = parseInt(req.query.limit as string) || 20;
//     const offset = (page - 1) * limit;

//     // Fetching notifications from DB
//     const restaurantNotifications = await db
//         .select()
//         .from(notifications)
//         .where(and(
//             eq(notifications.recipientType, "restaurant"),
//             eq(notifications.recipientId, restaurantId)
//         ))
//         .orderBy(desc(notifications.createdAt))
//         .limit(limit)
//         .offset(offset);
    
//     // 1. Format the notifications (Parse stringified JSON)
//     const formattedNotifications = restaurantNotifications.map((notif) => {
//         let parsedData = null;
//         if (notif.data) {
//             try {
//                 // تحويل الـ String لـ JSON Object
//                 parsedData = typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data;
//             } catch (error) {
//                 console.error(`[NOTIFICATIONS] Failed to parse data for notification ${notif.id}`);
//                 parsedData = notif.data; // Fallback in case of invalid JSON
//             }
//         }

//         return {
//             ...notif,
//             data: parsedData, // استخدام الداتا بعد التحويل
//         };
//     });

//     // 2. Return clean response structure
//     // افتراضاً إن الـ SuccessResponse بياخد الـ Payload بالشكل ده
//     return SuccessResponse(res, {
//         message: "Notifications fetched successfully",
//         data: formattedNotifications, // الـ Array بتاع الإشعارات مباشرة
//         pagination: {
//             page,
//             limit
//         }
//     });
// };
// // ==========================================
// // 2. Mark Notification as Read
// // ==========================================
// export const markNotificationAsRead = async (req: Request | any, res: Response) => {
//     if (!req.user) throw new UnauthorizedError("Unauthenticated");
//     const restaurantId = req.user.restaurantId || req.user.branchId;

//     if (!restaurantId) throw new BadRequest("Restaurant ID not found");
//     const { id } = req.params;

//     const [notification] = await db
//         .select()
//         .from(notifications)
//         .where(and(
//             eq(notifications.id, id),
//             eq(notifications.recipientId, restaurantId)
//         ))
//         .limit(1);

//     if (!notification) throw new NotFound("Notification not found");

//     await db.update(notifications)
//         .set({ isRead: true })
//         .where(eq(notifications.id, id));

//     return SuccessResponse(res, { message: "Notification marked as read" });
// };

// // ==========================================
// // 3. Mark All Notifications as Read
// // ==========================================
// export const markAllNotificationsAsRead = async (req: Request | any, res: Response) => {
//     if (!req.user) throw new UnauthorizedError("Unauthenticated");
    
//     const restaurantId = req.user.restaurantId || req.user.branchId;

//     if (!restaurantId) throw new BadRequest("Restaurant ID not found");

//     await db.update(notifications)
//         .set({ isRead: true })
//         .where(and(
//             eq(notifications.recipientType, "restaurant"),
//             eq(notifications.recipientId, restaurantId),
//             eq(notifications.isRead, false)
//         ));

//     return SuccessResponse(res, { message: "All notifications marked as read" });
// };
