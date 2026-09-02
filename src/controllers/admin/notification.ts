import { Request, Response } from "express";
import { db } from "../../models/connection";
import { notifications, restaurantSettings } from "../../models/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
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

    // Base conditions for this restaurant/branch
    const baseConditions: any[] = [
        eq(notifications.recipientType, "restaurant"),
        eq(notifications.recipientId, adminRestaurantId)
    ];

    if (targetBranchId) {
        baseConditions.push(
            sql`(
                JSON_UNQUOTE(JSON_EXTRACT(${notifications.data}, '$.branchId')) = ${targetBranchId}
                OR JSON_EXTRACT(${notifications.data}, '$.branchId') IS NULL
            )`
        );
    }

    // Filter conditions for current page view
    const filteredConditions = [...baseConditions];
    const isReadParam = req.query.isRead as string | undefined;
    const unreadOnlyParam = req.query.unreadOnly as string | undefined;

    if (isReadParam === "false" || unreadOnlyParam === "true") {
        filteredConditions.push(eq(notifications.isRead, false));
    } else if (isReadParam === "true") {
        filteredConditions.push(eq(notifications.isRead, true));
    } else if (req.query.all !== "true") {
        filteredConditions.push(eq(notifications.isRead, false));
    }

    // 🚀 Execute list query, total filtered count, and total unread count in parallel
    const [restaurantNotifications, totalCountResult, unreadCountResult] = await Promise.all([
        db
            .select()
            .from(notifications)
            .where(and(...filteredConditions))
            .orderBy(desc(notifications.createdAt))
            .limit(limit)
            .offset(offset),
        
        db
            .select({ count: count() })
            .from(notifications)
            .where(and(...filteredConditions)),
            
        db
            .select({ count: count() })
            .from(notifications)
            .where(and(...baseConditions, eq(notifications.isRead, false)))
    ]);

    const totalCount = Number(totalCountResult[0]?.count || 0);
    const unreadCount = Number(unreadCountResult[0]?.count || 0);

    // Format output
    const formattedNotifications = restaurantNotifications.map((notif) => {
        let parsedData = null;
        if (notif.data) {
            try {
                parsedData = typeof notif.data === "string" ? JSON.parse(notif.data) : notif.data;
            } catch (error) {
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
            limit,
            totalItems: totalCount,
            totalPages: Math.ceil(totalCount / limit),
            unreadCount, // Useful for header badge counters
        }
    });
};
// ==========================================
// 2. Read & Delete Notification
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

    // await db.update(notifications)
    //     .set({ isRead: true })
    //     .where(eq(notifications.id, id));

    await db.delete(notifications)
        .where(eq(notifications.id, id));

    return SuccessResponse(res, { message: "Notification marked as read" });
};

// ==========================================
// 3. Read & Delete All Notifications
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
        // eq(notifications.isRead, false)
    ];

    if (targetBranchId) {
        conditions.push(
            sql`(
                JSON_UNQUOTE(JSON_EXTRACT(${notifications.data}, '$.branchId')) = ${targetBranchId}
                OR JSON_EXTRACT(${notifications.data}, '$.branchId') IS NULL
            )`
        );
    }

    // await db.update(notifications)
    //     .set({ isRead: true })
    //     .where(and(...conditions));

    await db.delete(notifications)
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
            repeatNotificationStatuses: restaurantSettings.repeatNotificationStatuses,
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
                repeatNotificationStatuses: restaurantSettings.repeatNotificationStatuses,
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
            repeatNotificationStatuses: settings?.repeatNotificationStatuses ?? ["pending"],
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
        repeatNotificationStatuses
    } = req.body;

    const updateData: any = {};
    if (repeatNotification !== undefined) updateData.repeatNotification = Boolean(repeatNotification);
    if (repeatNotificationDuration !== undefined) updateData.repeatNotificationDuration = Number(repeatNotificationDuration);
    if (repeatNotificationStatuses !== undefined) updateData.repeatNotificationStatuses = repeatNotificationStatuses;

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
            repeatNotificationStatuses: restaurantSettings.repeatNotificationStatuses,
        })
        .from(restaurantSettings)
        .where(eq(restaurantSettings.restaurantId, adminRestaurantId))
        .limit(1);

    return SuccessResponse(res, {
        message: "Repeat notification settings updated successfully",
        data: updatedSettings
    });
};