"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = void 0;
const firebase_1 = require("./firebase");
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const uuid_1 = require("uuid");
const OTHER_PROJECT = {
    primary: "secondary",
    secondary: "primary",
};
/**
 * FCM error codes that mean "this token does not exist in the project you
 * just tried" — which is exactly what happens when a token minted under
 * Firebase Project A is sent through Project B's Messaging instance.
 */
function looksLikeWrongProjectOrDeadToken(err) {
    const code = err?.code || err?.errorInfo?.code;
    return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-argument";
}
/**
 * Sends one message to one token. Tries `record.project` first. If that
 * fails with a wrong-project-shaped error, tries the OTHER project. If the
 * other project succeeds, persists the correction. If both fail, cleans up dead token.
 */
async function sendWithAutoHeal(record, message) {
    const primaryTry = record.project;
    try {
        await (0, firebase_1.getMessaging)(primaryTry).send({ ...message, token: record.token });
        return; // worked on the first (cached/guessed) project — nothing to heal
    }
    catch (err) {
        if (!looksLikeWrongProjectOrDeadToken(err)) {
            console.error(`[FCM] Send failed for token ${record.token} on "${primaryTry}" (not a wrong-project error):`, err);
            return;
        }
        const fallback = OTHER_PROJECT[primaryTry];
        try {
            await (0, firebase_1.getMessaging)(fallback).send({ ...message, token: record.token });
            console.log(`[FCM] Token ${record.token} was actually on "${fallback}", not "${primaryTry}" — self-healing.`);
            if (record.persistCorrection) {
                try {
                    await record.persistCorrection(fallback);
                }
                catch (persistErr) {
                    console.error(`[FCM] Sent successfully via "${fallback}" but failed to persist the correction for token ${record.token}:`, persistErr);
                }
            }
        }
        catch (fallbackErr) {
            // Failed on BOTH projects — genuinely dead/expired token. Clean it up from database.
            console.error(`[FCM] Token ${record.token} failed on both projects — genuinely dead/expired token:`, fallbackErr);
            if (record.onDeadToken) {
                try {
                    await record.onDeadToken();
                    console.log(`[FCM] Cleaned up stale dead token ${record.token} from database.`);
                }
                catch (cleanErr) {
                    console.error(`[FCM] Failed to clean up dead token from database:`, cleanErr);
                }
            }
        }
    }
}
/**
 * Utility to send a push notification via Firebase and save it to the DB.
 */
const sendPushNotification = async (params) => {
    const { recipientType, recipientId, branchId, title, body, data } = params;
    let payloadData = {
        ...(data || {}),
        recipientType,
        recipientId,
        branchId: branchId || data?.branchId || null,
        restaurantId: data?.restaurantId || (recipientType === "restaurant" ? recipientId : null),
        sound: 'notification_sound'
    };
    if (recipientType === "restaurant") {
        try {
            const [settings] = await connection_1.db
                .select({
                repeatNotification: schema_1.restaurantSettings.repeatNotification,
                repeatNotificationDuration: schema_1.restaurantSettings.repeatNotificationDuration,
                repeatNotificationStatuses: schema_1.restaurantSettings.repeatNotificationStatuses,
            })
                .from(schema_1.restaurantSettings)
                .where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, recipientId))
                .limit(1);
            if (settings) {
                payloadData = {
                    repeatNotification: settings.repeatNotification ?? false,
                    repeatNotificationDuration: settings.repeatNotificationDuration ?? 20,
                    repeatNotificationStatuses: settings.repeatNotificationStatuses ?? ["pending"],
                    ...payloadData,
                };
            }
        }
        catch (err) {
            console.error("[NOTIFICATIONS] Failed to load restaurant repeat settings:", err);
        }
    }
    // 1. Save notification to database
    await connection_1.db.insert(schema_1.notifications).values({
        id: (0, uuid_1.v4)(),
        recipientType,
        recipientId,
        title,
        body,
        data: payloadData,
        createdAt: new Date()
    });
    try {
        const records = [];
        const seen = new Set();
        const add = (record) => {
            if (!record || !record.token || seen.has(record.token))
                return;
            seen.add(record.token);
            records.push(record);
        };
        if (recipientType === "user") {
            const targetRestaurantId = payloadData.restaurantId || data?.restaurantId;
            let userTokens = [];
            if (targetRestaurantId) {
                userTokens = await connection_1.db
                    .select({ id: schema_1.userFcmTokens.id, fcmToken: schema_1.userFcmTokens.fcmToken, firebaseProject: schema_1.userFcmTokens.firebaseProject })
                    .from(schema_1.userFcmTokens)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userFcmTokens.userId, recipientId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.userFcmTokens.restaurantId, targetRestaurantId), (0, drizzle_orm_1.sql) `${schema_1.userFcmTokens.restaurantId} IS NULL`)));
            }
            else {
                userTokens = await connection_1.db
                    .select({ id: schema_1.userFcmTokens.id, fcmToken: schema_1.userFcmTokens.fcmToken, firebaseProject: schema_1.userFcmTokens.firebaseProject })
                    .from(schema_1.userFcmTokens)
                    .where((0, drizzle_orm_1.eq)(schema_1.userFcmTokens.userId, recipientId));
            }
            for (const t of userTokens) {
                add({
                    token: t.fcmToken,
                    project: t.firebaseProject || "primary",
                    persistCorrection: async (correct) => {
                        await connection_1.db.update(schema_1.userFcmTokens).set({ firebaseProject: correct }).where((0, drizzle_orm_1.eq)(schema_1.userFcmTokens.id, t.id));
                    },
                    onDeadToken: async () => {
                        await connection_1.db.delete(schema_1.userFcmTokens).where((0, drizzle_orm_1.eq)(schema_1.userFcmTokens.id, t.id));
                    }
                });
            }
            if (records.length === 0) {
                const [user] = await connection_1.db
                    .select({ fcmToken: schema_1.users.fcmToken })
                    .from(schema_1.users)
                    .where((0, drizzle_orm_1.eq)(schema_1.users.id, recipientId))
                    .limit(1);
                if (user?.fcmToken) {
                    add({
                        token: user.fcmToken,
                        project: "primary",
                        onDeadToken: async () => {
                            await connection_1.db.update(schema_1.users).set({ fcmToken: null }).where((0, drizzle_orm_1.eq)(schema_1.users.id, recipientId));
                        }
                    });
                }
            }
        }
        else if (recipientType === "restaurant") {
            const [restaurant] = await connection_1.db
                .select({ fcmToken: schema_1.restaurants.fcmToken, firebaseProject: schema_1.restaurants.firebaseProject })
                .from(schema_1.restaurants)
                .where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, recipientId))
                .limit(1);
            if (restaurant?.fcmToken) {
                add({
                    token: restaurant.fcmToken,
                    project: restaurant.firebaseProject || "primary",
                    persistCorrection: async (correct) => {
                        await connection_1.db.update(schema_1.restaurants).set({ firebaseProject: correct }).where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, recipientId));
                    },
                    onDeadToken: async () => {
                        await connection_1.db.update(schema_1.restaurants).set({ fcmToken: null }).where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, recipientId));
                    }
                });
            }
            // Target ONLY active admins belonging to THIS restaurant
            let adminConditions = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.restaurantId, recipientId), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.status, "active"));
            if (branchId || payloadData.branchId) {
                const targetBranchId = branchId || payloadData.branchId;
                adminConditions = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.restaurantId, recipientId), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.status, "active"), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.branchId, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.type, "owner"), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.type, "subadmin")));
            }
            const admins = await connection_1.db
                .select({
                id: schema_1.restrauntadmin.id,
                fcmToken: schema_1.restrauntadmin.fcmToken,
                firebaseProject: schema_1.restrauntadmin.firebaseProject
            })
                .from(schema_1.restrauntadmin)
                .where(adminConditions);
            for (const adm of admins) {
                if (!adm.fcmToken)
                    continue;
                add({
                    token: adm.fcmToken,
                    project: adm.firebaseProject || "primary",
                    persistCorrection: async (correct) => {
                        await connection_1.db.update(schema_1.restrauntadmin).set({ firebaseProject: correct }).where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, adm.id));
                    },
                    onDeadToken: async () => {
                        await connection_1.db.update(schema_1.restrauntadmin).set({ fcmToken: null }).where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, adm.id));
                    }
                });
            }
        }
        if (records.length > 0) {
            const message = {
                notification: { title, body },
                data: { payload: JSON.stringify(payloadData) },
                apns: { payload: { aps: { sound: "notification_sound.wav" } } },
            };
            await Promise.all(records.map((record) => sendWithAutoHeal(record, message)));
            console.log(`[FCM] Notification processed for ${records.length} token(s), ${recipientType} ${recipientId}`);
        }
        else {
            console.log(`[FCM] Skipped push: No FCM token found for ${recipientType} ${recipientId}`);
        }
    }
    catch (error) {
        console.error(`[FCM] Failed to send push notification to ${recipientType} ${recipientId}:`, error);
    }
};
exports.sendPushNotification = sendPushNotification;
