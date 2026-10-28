import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    pushedNotifications,
    userFcmTokens,
    notifications,
} from "../../models/schema";
import { eq, and, desc, count, isNotNull } from "drizzle-orm";
import { getMessaging } from "../../utils/firebase";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// Helper: dispatch FCM + save in notifications table for every user
// ==========================================
async function dispatchToAllRestaurantUsers(params: {
    restaurantId: string;
    title: string;
    body: string;
    data?: Record<string, string>;
}): Promise<number> {
    const { restaurantId, title, body, data = {} } = params;

    // Fetch all tokens WITH their userId for this restaurant
    const tokenRows = await db
        .select({
            userId:          userFcmTokens.userId,
            fcmToken:        userFcmTokens.fcmToken,
            firebaseProject: userFcmTokens.firebaseProject,
        })
        .from(userFcmTokens)
        .where(
            and(
                eq(userFcmTokens.restaurantId, restaurantId),
                isNotNull(userFcmTokens.fcmToken)
            )
        );

    if (tokenRows.length === 0) {
        console.log(`[PushedNotification] No FCM tokens found for restaurant ${restaurantId}`);
        return 0;
    }

    // Deduplicate: one record per unique token
    const seenTokens  = new Set<string>();
    const seenUsers   = new Set<string>();
    const records: { userId: string; token: string; project: string }[] = [];

    for (const row of tokenRows) {
        if (row.fcmToken && !seenTokens.has(row.fcmToken)) {
            seenTokens.add(row.fcmToken);
            records.push({
                userId:  row.userId,
                token:   row.fcmToken,
                project: row.firebaseProject || "primary",
            });
        }
        // Track unique user IDs for the notifications insert
        if (row.userId) seenUsers.add(row.userId);
    }

    // ── 1. Bulk-insert into `notifications` (same shape as sendPushNotification) ──
    const payloadData = {
        ...data,
        restaurantId,
        type:  "pushed_notification",
        sound: "notification_sound.wav",
    };

    if (seenUsers.size > 0) {
        const notifRows = Array.from(seenUsers).map((userId) => ({
            id:            uuidv4(),
            recipientType: "user" as const,
            recipientId:   userId,
            title,
            body,
            data:          payloadData,
            isRead:        false,
            createdAt:     new Date(),
        }));

        // Insert in chunks of 500 to avoid oversized queries
        for (let i = 0; i < notifRows.length; i += 500) {
            await db.insert(notifications).values(notifRows.slice(i, i + 500));
        }
    }

    // ── 2. Group tokens by Firebase project and send FCM ──
    const byProject = new Map<string, string[]>();
    for (const rec of records) {
        byProject.set(rec.project, [...(byProject.get(rec.project) ?? []), rec.token]);
    }

    const fcmPayload = {
        notification: { title, body },
        data:         { payload: JSON.stringify(payloadData) },
        android:      { notification: { sound: "notification_sound" } },
        apns:         { payload: { aps: { sound: "notification_sound.wav" } } },
    };

    let totalSent = 0;

    for (const [project, tokens] of byProject) {
        let messaging;
        try {
            messaging = getMessaging(project);
        } catch (err) {
            console.error(`[PushedNotification] Firebase project "${project}" not configured:`, err);
            continue;
        }

        for (let i = 0; i < tokens.length; i += 500) {
            const chunk = tokens.slice(i, i + 500);
            try {
                const result = await messaging.sendEachForMulticast({ ...fcmPayload, tokens: chunk });

                totalSent += result.successCount;

                // Cleanup dead tokens
                for (let j = 0; j < result.responses.length; j++) {
                    const resp = result.responses[j];
                    if (!resp.success && resp.error?.code === "messaging/registration-token-not-registered") {
                        await db.delete(userFcmTokens).where(eq(userFcmTokens.fcmToken, chunk[j]));
                    }
                }

                console.log(`[PushedNotification] ${project}: ${result.successCount} ok / ${result.failureCount} failed`);
            } catch (err) {
                console.error(`[PushedNotification] Failed batch for project "${project}":`, err);
            }
        }
    }

    return totalSent;
}




// ==========================================
// 1. Create Pushed Notification
// ==========================================
export const createPushedNotification = async (
    req: Request | any,
    res: Response
) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");

    const { title, body, mode, scheduledAt, scheduledEndAt } = req.body;

    const isPushedNow = mode === "pushed_now" || !mode;

    // Insert the record first
    const id = uuidv4();
    await db.insert(pushedNotifications).values({
        id,
        restaurantId,
        title,
        body,
        mode: isPushedNow ? "pushed_now" : "scheduled",
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt) : null,
        isSent: false,
        recipientCount: 0,
    });

    // If mode is "pushed_now" → dispatch immediately
    if (isPushedNow) {
        const sentCount = await dispatchToAllRestaurantUsers({
            restaurantId,
            title,
            body,
        });

        await db
            .update(pushedNotifications)
            .set({
                isSent: true,
                sentAt: new Date(),
                recipientCount: sentCount,
            })
            .where(eq(pushedNotifications.id, id));
    }

    const [created] = await db
        .select()
        .from(pushedNotifications)
        .where(eq(pushedNotifications.id, id))
        .limit(1);

    return SuccessResponse(
        res,
        {
            message: isPushedNow
                ? "Notification dispatched immediately"
                : "Notification scheduled successfully",
            data: created,
        },
        201
    );
};

// ==========================================
// 2. List Pushed Notifications
// ==========================================
export const getPushedNotifications = async (
    req: Request | any,
    res: Response
) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const [rows, totalResult] = await Promise.all([
        db
            .select()
            .from(pushedNotifications)
            .where(eq(pushedNotifications.restaurantId, restaurantId))
            .orderBy(desc(pushedNotifications.createdAt))
            .limit(limit)
            .offset(offset),

        db
            .select({ count: count() })
            .from(pushedNotifications)
            .where(eq(pushedNotifications.restaurantId, restaurantId)),
    ]);

    const totalItems = Number(totalResult[0]?.count ?? 0);

    return SuccessResponse(res, {
        message: "Pushed notifications fetched successfully",
        data: rows,
        pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.ceil(totalItems / limit),
        },
    });
};

// ==========================================
// 3. Get Single Pushed Notification
// ==========================================
export const getPushedNotificationById = async (
    req: Request | any,
    res: Response
) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");

    const { id } = req.params;

    const [notification] = await db
        .select()
        .from(pushedNotifications)
        .where(
            and(
                eq(pushedNotifications.id, id),
                eq(pushedNotifications.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!notification) throw new NotFound("Pushed notification not found");

    return SuccessResponse(res, {
        message: "Pushed notification fetched successfully",
        data: notification,
    });
};

// ==========================================
// 4. Update Pushed Notification (only if not yet sent)
// ==========================================
export const updatePushedNotification = async (
    req: Request | any,
    res: Response
) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(pushedNotifications)
        .where(
            and(
                eq(pushedNotifications.id, id),
                eq(pushedNotifications.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Pushed notification not found");

    if (existing.isSent) {
        throw new BadRequest(
            "Cannot update a notification that has already been sent"
        );
    }

    const { title, body, mode, scheduledAt, scheduledEndAt } = req.body;

    const updateData: Record<string, any> = {};
    if (title !== undefined) updateData.title = title;
    if (body !== undefined) updateData.body = body;
    if (mode !== undefined) updateData.mode = mode;
    if (scheduledAt !== undefined)
        updateData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (scheduledEndAt !== undefined)
        updateData.scheduledEndAt = scheduledEndAt
            ? new Date(scheduledEndAt)
            : null;

    await db
        .update(pushedNotifications)
        .set(updateData)
        .where(eq(pushedNotifications.id, id));

    const [updated] = await db
        .select()
        .from(pushedNotifications)
        .where(eq(pushedNotifications.id, id))
        .limit(1);

    return SuccessResponse(res, {
        message: "Pushed notification updated successfully",
        data: updated,
    });
};

// ==========================================
// 5. Delete Pushed Notification
// ==========================================
export const deletePushedNotification = async (
    req: Request | any,
    res: Response
) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(pushedNotifications)
        .where(
            and(
                eq(pushedNotifications.id, id),
                eq(pushedNotifications.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Pushed notification not found");

    await db
        .delete(pushedNotifications)
        .where(eq(pushedNotifications.id, id));

    return SuccessResponse(res, {
        message: "Pushed notification deleted successfully",
    });
};

// ==========================================
// 6. Send Now (manual dispatch for scheduled notifications)
// ==========================================
export const sendPushedNotificationNow = async (
    req: Request | any,
    res: Response
) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");

    const { id } = req.params;

    const [existing] = await db
        .select()
        .from(pushedNotifications)
        .where(
            and(
                eq(pushedNotifications.id, id),
                eq(pushedNotifications.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing) throw new NotFound("Pushed notification not found");

    if (existing.isSent) {
        throw new BadRequest("This notification has already been sent");
    }

    const sentCount = await dispatchToAllRestaurantUsers({
        restaurantId,
        title: existing.title,
        body: existing.body,
    });

    await db
        .update(pushedNotifications)
        .set({
            isSent: true,
            sentAt: new Date(),
            recipientCount: sentCount,
        })
        .where(eq(pushedNotifications.id, id));

    const [updated] = await db
        .select()
        .from(pushedNotifications)
        .where(eq(pushedNotifications.id, id))
        .limit(1);

    return SuccessResponse(res, {
        message: `Notification dispatched successfully to ${sentCount} device(s)`,
        data: updated,
    });
};
