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

    console.log(`[NOTIFICATIONS] Fetching notifications for:`, {
        resolvedRestaurantId: restaurantId,
        userObj: req.user,
    });

    // Pagination (optional)
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // DEBUG: First check ALL restaurant notifications in the DB
    const allRestaurantNotifs = await db
        .select()
        .from(notifications)
        .where(eq(notifications.recipientType, "restaurant"))
        .orderBy(desc(notifications.createdAt))
        .limit(5);
    console.log(`[NOTIFICATIONS] All restaurant notifications in DB:`, allRestaurantNotifs.length, allRestaurantNotifs.map(n => ({ id: n.id, recipientId: n.recipientId, title: n.title })));

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
    
    console.log(`[NOTIFICATIONS] Filtered notifications count: ${restaurantNotifications.length}`);

    return SuccessResponse(res, {
        message: "Notifications fetched successfully",
        data: restaurantNotifications,
        page,
        limit
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
