"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushedNotificationNow = exports.deletePushedNotification = exports.updatePushedNotification = exports.getPushedNotificationById = exports.getPushedNotifications = exports.createPushedNotification = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const firebase_1 = require("../../utils/firebase");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
// ==========================================
// Helper: dispatch FCM + save in notifications table for every user
// ==========================================
async function dispatchToAllRestaurantUsers(params) {
    const { restaurantId, title, body, data = {} } = params;
    // Fetch all tokens WITH their userId for this restaurant
    const tokenRows = await connection_1.db
        .select({
        userId: schema_1.userFcmTokens.userId,
        fcmToken: schema_1.userFcmTokens.fcmToken,
        firebaseProject: schema_1.userFcmTokens.firebaseProject,
    })
        .from(schema_1.userFcmTokens)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userFcmTokens.restaurantId, restaurantId), (0, drizzle_orm_1.isNotNull)(schema_1.userFcmTokens.fcmToken)));
    if (tokenRows.length === 0) {
        console.log(`[PushedNotification] No FCM tokens found for restaurant ${restaurantId}`);
        return 0;
    }
    // Deduplicate: one record per unique token
    const seenTokens = new Set();
    const seenUsers = new Set();
    const records = [];
    for (const row of tokenRows) {
        if (row.fcmToken && !seenTokens.has(row.fcmToken)) {
            seenTokens.add(row.fcmToken);
            records.push({
                userId: row.userId,
                token: row.fcmToken,
                project: row.firebaseProject || "primary",
            });
        }
        // Track unique user IDs for the notifications insert
        if (row.userId)
            seenUsers.add(row.userId);
    }
    // ── 1. Bulk-insert into `notifications` (same shape as sendPushNotification) ──
    const payloadData = {
        ...data,
        restaurantId,
        type: "pushed_notification",
        sound: "notification_sound.wav",
    };
    if (seenUsers.size > 0) {
        const notifRows = Array.from(seenUsers).map((userId) => ({
            id: (0, uuid_1.v4)(),
            recipientType: "user",
            recipientId: userId,
            title,
            body,
            data: payloadData,
            isRead: false,
            createdAt: new Date(),
        }));
        // Insert in chunks of 500 to avoid oversized queries
        for (let i = 0; i < notifRows.length; i += 500) {
            await connection_1.db.insert(schema_1.notifications).values(notifRows.slice(i, i + 500));
        }
    }
    // ── 2. Group tokens by Firebase project and send FCM ──
    const byProject = new Map();
    for (const rec of records) {
        byProject.set(rec.project, [...(byProject.get(rec.project) ?? []), rec.token]);
    }
    const fcmPayload = {
        notification: { title, body },
        data: { payload: JSON.stringify(payloadData) },
        android: { notification: { sound: "notification_sound" } },
        apns: { payload: { aps: { sound: "notification_sound.wav" } } },
    };
    let totalSent = 0;
    for (const [project, tokens] of byProject) {
        let messaging;
        try {
            messaging = (0, firebase_1.getMessaging)(project);
        }
        catch (err) {
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
                        await connection_1.db.delete(schema_1.userFcmTokens).where((0, drizzle_orm_1.eq)(schema_1.userFcmTokens.fcmToken, chunk[j]));
                    }
                }
                console.log(`[PushedNotification] ${project}: ${result.successCount} ok / ${result.failureCount} failed`);
            }
            catch (err) {
                console.error(`[PushedNotification] Failed batch for project "${project}":`, err);
            }
        }
    }
    return totalSent;
}
// ==========================================
// 1. Create Pushed Notification
// ==========================================
const createPushedNotification = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { title, body, mode, scheduledAt, scheduledEndAt } = req.body;
    const isPushedNow = mode === "pushed_now" || !mode;
    // Insert the record first
    const id = (0, uuid_1.v4)();
    await connection_1.db.insert(schema_1.pushedNotifications).values({
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
        await connection_1.db
            .update(schema_1.pushedNotifications)
            .set({
            isSent: true,
            sentAt: new Date(),
            recipientCount: sentCount,
        })
            .where((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id));
    }
    const [created] = await connection_1.db
        .select()
        .from(schema_1.pushedNotifications)
        .where((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: isPushedNow
            ? "Notification dispatched immediately"
            : "Notification scheduled successfully",
        data: created,
    }, 201);
};
exports.createPushedNotification = createPushedNotification;
// ==========================================
// 2. List Pushed Notifications
// ==========================================
const getPushedNotifications = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const [rows, totalResult] = await Promise.all([
        connection_1.db
            .select()
            .from(schema_1.pushedNotifications)
            .where((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.restaurantId, restaurantId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.pushedNotifications.createdAt))
            .limit(limit)
            .offset(offset),
        connection_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema_1.pushedNotifications)
            .where((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.restaurantId, restaurantId)),
    ]);
    const totalItems = Number(totalResult[0]?.count ?? 0);
    return (0, response_1.SuccessResponse)(res, {
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
exports.getPushedNotifications = getPushedNotifications;
// ==========================================
// 3. Get Single Pushed Notification
// ==========================================
const getPushedNotificationById = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { id } = req.params;
    const [notification] = await connection_1.db
        .select()
        .from(schema_1.pushedNotifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id), (0, drizzle_orm_1.eq)(schema_1.pushedNotifications.restaurantId, restaurantId)))
        .limit(1);
    if (!notification)
        throw new NotFound_1.NotFound("Pushed notification not found");
    return (0, response_1.SuccessResponse)(res, {
        message: "Pushed notification fetched successfully",
        data: notification,
    });
};
exports.getPushedNotificationById = getPushedNotificationById;
// ==========================================
// 4. Update Pushed Notification (only if not yet sent)
// ==========================================
const updatePushedNotification = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.pushedNotifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id), (0, drizzle_orm_1.eq)(schema_1.pushedNotifications.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Pushed notification not found");
    if (existing.isSent) {
        throw new BadRequest_1.BadRequest("Cannot update a notification that has already been sent");
    }
    const { title, body, mode, scheduledAt, scheduledEndAt } = req.body;
    const updateData = {};
    if (title !== undefined)
        updateData.title = title;
    if (body !== undefined)
        updateData.body = body;
    if (mode !== undefined)
        updateData.mode = mode;
    if (scheduledAt !== undefined)
        updateData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (scheduledEndAt !== undefined)
        updateData.scheduledEndAt = scheduledEndAt
            ? new Date(scheduledEndAt)
            : null;
    await connection_1.db
        .update(schema_1.pushedNotifications)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id));
    const [updated] = await connection_1.db
        .select()
        .from(schema_1.pushedNotifications)
        .where((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Pushed notification updated successfully",
        data: updated,
    });
};
exports.updatePushedNotification = updatePushedNotification;
// ==========================================
// 5. Delete Pushed Notification
// ==========================================
const deletePushedNotification = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.pushedNotifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id), (0, drizzle_orm_1.eq)(schema_1.pushedNotifications.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Pushed notification not found");
    await connection_1.db
        .delete(schema_1.pushedNotifications)
        .where((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id));
    return (0, response_1.SuccessResponse)(res, {
        message: "Pushed notification deleted successfully",
    });
};
exports.deletePushedNotification = deletePushedNotification;
// ==========================================
// 6. Send Now (manual dispatch for scheduled notifications)
// ==========================================
const sendPushedNotificationNow = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const restaurantId = req.user.restaurantId || req.user.id;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    const { id } = req.params;
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.pushedNotifications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id), (0, drizzle_orm_1.eq)(schema_1.pushedNotifications.restaurantId, restaurantId)))
        .limit(1);
    if (!existing)
        throw new NotFound_1.NotFound("Pushed notification not found");
    if (existing.isSent) {
        throw new BadRequest_1.BadRequest("This notification has already been sent");
    }
    const sentCount = await dispatchToAllRestaurantUsers({
        restaurantId,
        title: existing.title,
        body: existing.body,
    });
    await connection_1.db
        .update(schema_1.pushedNotifications)
        .set({
        isSent: true,
        sentAt: new Date(),
        recipientCount: sentCount,
    })
        .where((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id));
    const [updated] = await connection_1.db
        .select()
        .from(schema_1.pushedNotifications)
        .where((0, drizzle_orm_1.eq)(schema_1.pushedNotifications.id, id))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: `Notification dispatched successfully to ${sentCount} device(s)`,
        data: updated,
    });
};
exports.sendPushedNotificationNow = sendPushedNotificationNow;
