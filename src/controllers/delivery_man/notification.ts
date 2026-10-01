import { Request, Response } from "express";
import { db } from "../../models/connection";
import { notifications } from "../../models/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { NotFound } from "../../Errors/NotFound";

// ==========================================
// GET /delivery-man/notifications
// ==========================================
export const getMyNotifications = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const unreadOnly = req.query.unreadOnly === "true";
    const isReadParam = req.query.isRead;

    const conditions: any[] = [
        or(
            eq(notifications.recipientType, "delivery_man"),
            eq(notifications.recipientType, "restaurant")
        ),
        eq(notifications.recipientId, deliveryManId),
    ];

    if (unreadOnly || isReadParam === "false") {
        conditions.push(eq(notifications.isRead, false));
    } else if (isReadParam === "true") {
        conditions.push(eq(notifications.isRead, true));
    }

    const myNotifications = await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

    // Count unread
    const allForUnread = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
            and(
                or(
                    eq(notifications.recipientType, "delivery_man"),
                    eq(notifications.recipientType, "restaurant")
                ),
                eq(notifications.recipientId, deliveryManId),
                eq(notifications.isRead, false)
            )
        );

    return SuccessResponse(res, {
        message: "Notifications fetched successfully",
        page,
        limit,
        unreadCount: allForUnread.length,
        data: myNotifications,
    });
};

// ==========================================
// PATCH /delivery-man/notifications/:id/read
// ==========================================
export const markNotificationAsRead = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;
    const { id } = req.params;

    const [notification] = await db
        .select()
        .from(notifications)
        .where(
            and(
                eq(notifications.id, id),
                or(
                    eq(notifications.recipientType, "delivery_man"),
                    eq(notifications.recipientType, "restaurant")
                ),
                eq(notifications.recipientId, deliveryManId)
            )
        )
        .limit(1);

    if (!notification) throw new NotFound("Notification not found");

    await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, id));

    return SuccessResponse(res, { message: "Notification marked as read" });
};

// ==========================================
// PATCH /delivery-man/notifications/read-all
// ==========================================
export const markAllNotificationsAsRead = async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const deliveryManId = req.user.id;

    await db
        .update(notifications)
        .set({ isRead: true })
        .where(
            and(
                or(
                    eq(notifications.recipientType, "delivery_man"),
                    eq(notifications.recipientType, "restaurant")
                ),
                eq(notifications.recipientId, deliveryManId),
                eq(notifications.isRead, false)
            )
        );

    return SuccessResponse(res, { message: "All notifications marked as read" });
};
