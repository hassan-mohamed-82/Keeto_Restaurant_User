import { Request, Response } from "express";
import { db } from "../../models/connection";
import { notifications } from "../../models/schema";
import { eq, and, desc } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { NotFound } from "../../Errors/NotFound";

// ==========================================
// 1. Get Restaurant Notifications
// ==========================================
export const getMyNotifications = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    
    // Both restaurant owner and subadmins/managers belong to a restaurantId
    const restaurantId = req.user.restaurantId || req.user.id; 

    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Fetching notifications from DB
    const restaurantNotifications = await db
        .select()
        .from(notifications)
        .where(and(
            eq(notifications.recipientType, "restaurant"),
            eq(notifications.recipientId, restaurantId)
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);
    
    // 1. Format the notifications (Parse stringified JSON)
    const formattedNotifications = restaurantNotifications.map((notif) => {
        let parsedData = null;
        if (notif.data) {
            try {
                // تحويل الـ String لـ JSON Object
                parsedData = typeof notif.data === 'string' ? JSON.parse(notif.data) : notif.data;
            } catch (error) {
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
    return SuccessResponse(res, {
        message: "Notifications fetched successfully",
        data: formattedNotifications, // الـ Array بتاع الإشعارات مباشرة
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
    const restaurantId = req.user.restaurantId || req.user.id; 
    const { id } = req.params;

    const [notification] = await db
        .select()
        .from(notifications)
        .where(and(
            eq(notifications.id, id),
            eq(notifications.recipientId, restaurantId)
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
    const restaurantId = req.user.restaurantId || req.user.id; 

    await db.update(notifications)
        .set({ isRead: true })
        .where(and(
            eq(notifications.recipientType, "restaurant"),
            eq(notifications.recipientId, restaurantId),
            eq(notifications.isRead, false)
        ));

    return SuccessResponse(res, { message: "All notifications marked as read" });
};
