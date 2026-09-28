"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotification = void 0;
const firebase_1 = require("./firebase");
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const uuid_1 = require("uuid");
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
        sound: 'notification_sound.wav'
    };
    // If recipient is a restaurant, attach repeat notification settings
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
    // 1. Save notification to database regardless of FCM success/failure
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
        // 2. Look up the FCM tokens for the recipient(s)
        const tokens = [];
        if (recipientType === "user") {
            const targetRestaurantId = payloadData.restaurantId || data?.restaurantId;
            let userTokens = [];
            if (targetRestaurantId) {
                userTokens = await connection_1.db
                    .select({ fcmToken: schema_1.userFcmTokens.fcmToken })
                    .from(schema_1.userFcmTokens)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userFcmTokens.userId, recipientId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.userFcmTokens.restaurantId, targetRestaurantId), (0, drizzle_orm_1.sql) `${schema_1.userFcmTokens.restaurantId} IS NULL`)));
            }
            else {
                userTokens = await connection_1.db
                    .select({ fcmToken: schema_1.userFcmTokens.fcmToken })
                    .from(schema_1.userFcmTokens)
                    .where((0, drizzle_orm_1.eq)(schema_1.userFcmTokens.userId, recipientId));
            }
            for (const t of userTokens) {
                if (t.fcmToken && !tokens.includes(t.fcmToken)) {
                    tokens.push(t.fcmToken);
                }
            }
            // Fallback to legacy user fcmToken if userFcmTokens table has no records for this user/restaurant
            if (tokens.length === 0) {
                const [user] = await connection_1.db
                    .select({ fcmToken: schema_1.users.fcmToken })
                    .from(schema_1.users)
                    .where((0, drizzle_orm_1.eq)(schema_1.users.id, recipientId))
                    .limit(1);
                if (user?.fcmToken)
                    tokens.push(user.fcmToken);
            }
        }
        else if (recipientType === "restaurant") {
            // Main restaurant owner token
            const [restaurant] = await connection_1.db
                .select({ fcmToken: schema_1.restaurants.fcmToken })
                .from(schema_1.restaurants)
                .where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, recipientId))
                .limit(1);
            if (restaurant?.fcmToken)
                tokens.push(restaurant.fcmToken);
            // Fetch tokens from restrauntadmin based on branch
            let adminConditions = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.restaurantId, recipientId), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.status, "active"));
            if (branchId || payloadData.branchId) {
                const targetBranchId = branchId || payloadData.branchId;
                adminConditions = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.restaurantId, recipientId), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.status, "active"), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.branchId, targetBranchId), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.type, "owner"), (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.type, "subadmin")));
            }
            const admins = await connection_1.db
                .select({ fcmToken: schema_1.restrauntadmin.fcmToken })
                .from(schema_1.restrauntadmin)
                .where(adminConditions);
            for (const adm of admins) {
                if (adm.fcmToken && !tokens.includes(adm.fcmToken)) {
                    tokens.push(adm.fcmToken);
                }
            }
        }
        // 3. Send via Firebase if token exists
        const uniqueTokens = [...new Set(tokens.filter(t => !!t))];
        if (uniqueTokens.length > 0) {
            await Promise.all(uniqueTokens.map(async (token) => {
                try {
                    const message = {
                        notification: {
                            title,
                            body,
                        },
                        data: {
                            payload: JSON.stringify(payloadData),
                        },
                        apns: {
                            payload: {
                                aps: {
                                    sound: "notification_sound.wav",
                                },
                            },
                        },
                        token,
                    };
                    await firebase_1.messaging.send(message);
                }
                catch (sendErr) {
                    console.error(`[FCM] Failed to send push to token ${token}:`, sendErr);
                }
            }));
            console.log(`[FCM] Notification sent successfully to ${uniqueTokens.length} recipients for ${recipientType} ${recipientId}`);
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
// import { getMessaging, FirebaseProjectKey } from "./firebase";
// import { db } from "../models/connection";
// import { notifications, users, restaurants, restrauntadmin, restaurantSettings, userFcmTokens } from "../models/schema";
// import { eq, and, or, sql } from "drizzle-orm";
// import { v4 as uuidv4 } from "uuid";
// interface TokenRecord {
//     token: string;
//     project: FirebaseProjectKey;
//     /** how to persist a corrected project guess back to its source row, if we learn it was wrong */
//     persistCorrection?: (correctProject: FirebaseProjectKey) => Promise<void>;
//     /** clean up dead/unregistered token from database */
//     onDeadToken?: () => Promise<void>;
// }
// const OTHER_PROJECT: Record<FirebaseProjectKey, FirebaseProjectKey> = {
//     primary: "secondary",
//     secondary: "primary",
// };
// /**
//  * FCM error codes that mean "this token does not exist in the project you
//  * just tried" — which is exactly what happens when a token minted under
//  * Firebase Project A is sent through Project B's Messaging instance.
//  */
// function looksLikeWrongProjectOrDeadToken(err: any): boolean {
//     const code: string = err?.code || err?.errorInfo?.code || "";
//     const msg: string = String(err?.message || err?.errorInfo?.message || "").toLowerCase();
//     return (
//         code === "messaging/mismatched-credential" ||   // SENDER_ID_MISMATCH: التوكن من بروجكت تاني
//         code === "messaging/registration-token-not-registered" ||
//         code === "messaging/invalid-registration-token" ||
//         code === "messaging/invalid-argument" ||
//         msg.includes("senderid mismatch") ||
//         msg.includes("sender_id_mismatch")
//     );
// }
// /**
//  * Sends one message to one token. Tries `record.project` first. If that
//  * fails with a wrong-project-shaped error, tries the OTHER project. If the
//  * other project succeeds, persists the correction. If both fail, cleans up dead token.
//  */
// async function sendWithAutoHeal(record: TokenRecord, message: any): Promise<void> {
//     const primaryTry = record.project;
//     try {
//         await getMessaging(primaryTry).send({ ...message, token: record.token });
//         return; // worked on the first (cached/guessed) project — nothing to heal
//     } catch (err) {
//         if (!looksLikeWrongProjectOrDeadToken(err)) {
//             console.error(`[FCM] Send failed for token ${record.token} on "${primaryTry}" (not a wrong-project error):`, err);
//             return;
//         }
//         const fallback = OTHER_PROJECT[primaryTry];
//         try {
//             await getMessaging(fallback).send({ ...message, token: record.token });
//             console.log(`[FCM] Token ${record.token} was actually on "${fallback}", not "${primaryTry}" — self-healing.`);
//             if (record.persistCorrection) {
//                 try {
//                     await record.persistCorrection(fallback);
//                 } catch (persistErr) {
//                     console.error(`[FCM] Sent successfully via "${fallback}" but failed to persist the correction for token ${record.token}:`, persistErr);
//                 }
//             }
//         } catch (fallbackErr) {
//             // Failed on BOTH projects — genuinely dead/expired token. Clean it up from database.
//             console.error(`[FCM] Token ${record.token} failed on both projects — genuinely dead/expired token:`, fallbackErr);
//             if (record.onDeadToken) {
//                 try {
//                     await record.onDeadToken();
//                     console.log(`[FCM] Cleaned up stale dead token ${record.token} from database.`);
//                 } catch (cleanErr) {
//                     console.error(`[FCM] Failed to clean up dead token from database:`, cleanErr);
//                 }
//             }
//         }
//     }
// }
// /**
//  * Utility to send a push notification via Firebase and save it to the DB.
//  */
// export const sendPushNotification = async (params: {
//     recipientType: "user" | "restaurant" | "superadmin";
//     recipientId: string;
//     branchId?: string | null;
//     title: string;
//     body: string;
//     data?: any;
// }) => {
//     const { recipientType, recipientId, branchId, title, body, data } = params;
//     let payloadData: any = {
//         ...(data || {}),
//         recipientType,
//         recipientId,
//         branchId: branchId || data?.branchId || null,
//         restaurantId: data?.restaurantId || (recipientType === "restaurant" ? recipientId : null),
//         sound: 'notification_sound'
//     };
//     if (recipientType === "restaurant") {
//         try {
//             const [settings] = await db
//                 .select({
//                     repeatNotification: restaurantSettings.repeatNotification,
//                     repeatNotificationDuration: restaurantSettings.repeatNotificationDuration,
//                     repeatNotificationStatuses: restaurantSettings.repeatNotificationStatuses,
//                 })
//                 .from(restaurantSettings)
//                 .where(eq(restaurantSettings.restaurantId, recipientId))
//                 .limit(1);
//             if (settings) {
//                 payloadData = {
//                     repeatNotification: settings.repeatNotification ?? false,
//                     repeatNotificationDuration: settings.repeatNotificationDuration ?? 20,
//                     repeatNotificationStatuses: settings.repeatNotificationStatuses ?? ["pending"],
//                     ...payloadData,
//                 };
//             }
//         } catch (err) {
//             console.error("[NOTIFICATIONS] Failed to load restaurant repeat settings:", err);
//         }
//     }
//     // 1. Save notification to database
//     await db.insert(notifications).values({
//         id: uuidv4(),
//         recipientType,
//         recipientId,
//         title,
//         body,
//         data: payloadData,
//         createdAt: new Date()
//     });
//     try {
//         const records: TokenRecord[] = [];
//         const seen = new Set<string>();
//         const add = (record: TokenRecord | null) => {
//             if (!record || !record.token || seen.has(record.token)) return;
//             seen.add(record.token);
//             records.push(record);
//         };
//         if (recipientType === "user") {
//             const targetRestaurantId = payloadData.restaurantId || data?.restaurantId;
//             let userTokens: { id: string; fcmToken: string; firebaseProject: string | null }[] = [];
//             if (targetRestaurantId) {
//                 userTokens = await db
//                     .select({ id: userFcmTokens.id, fcmToken: userFcmTokens.fcmToken, firebaseProject: userFcmTokens.firebaseProject })
//                     .from(userFcmTokens)
//                     .where(and(
//                         eq(userFcmTokens.userId, recipientId),
//                         or(
//                             eq(userFcmTokens.restaurantId, targetRestaurantId),
//                             sql`${userFcmTokens.restaurantId} IS NULL`
//                         )
//                     ));
//             } else {
//                 userTokens = await db
//                     .select({ id: userFcmTokens.id, fcmToken: userFcmTokens.fcmToken, firebaseProject: userFcmTokens.firebaseProject })
//                     .from(userFcmTokens)
//                     .where(eq(userFcmTokens.userId, recipientId));
//             }
//             for (const t of userTokens) {
//                 add({
//                     token: t.fcmToken,
//                     project: (t.firebaseProject as FirebaseProjectKey) || "primary",
//                     persistCorrection: async (correct) => {
//                         await db.update(userFcmTokens).set({ firebaseProject: correct }).where(eq(userFcmTokens.id, t.id));
//                     },
//                     onDeadToken: async () => {
//                         await db.delete(userFcmTokens).where(eq(userFcmTokens.id, t.id));
//                     }
//                 });
//             }
//             if (records.length === 0) {
//                 const [user] = await db
//                     .select({ fcmToken: users.fcmToken })
//                     .from(users)
//                     .where(eq(users.id, recipientId))
//                     .limit(1);
//                 if (user?.fcmToken) {
//                     add({
//                         token: user.fcmToken,
//                         project: "primary",
//                         onDeadToken: async () => {
//                             await db.update(users).set({ fcmToken: null }).where(eq(users.id, recipientId));
//                         }
//                     });
//                 }
//             }
//         } else if (recipientType === "restaurant") {
//             const [restaurant] = await db
//                 .select({ fcmToken: restaurants.fcmToken, firebaseProject: restaurants.firebaseProject })
//                 .from(restaurants)
//                 .where(eq(restaurants.id, recipientId))
//                 .limit(1);
//             if (restaurant?.fcmToken) {
//                 add({
//                     token: restaurant.fcmToken,
//                     project: (restaurant.firebaseProject as FirebaseProjectKey) || "primary",
//                     persistCorrection: async (correct) => {
//                         await db.update(restaurants).set({ firebaseProject: correct }).where(eq(restaurants.id, recipientId));
//                     },
//                     onDeadToken: async () => {
//                         await db.update(restaurants).set({ fcmToken: null }).where(eq(restaurants.id, recipientId));
//                     }
//                 });
//             }
//             // Target ONLY active admins belonging to THIS restaurant
//             let adminConditions = and(
//                 eq(restrauntadmin.restaurantId, recipientId),
//                 eq(restrauntadmin.status, "active")
//             );
//             if (branchId || payloadData.branchId) {
//                 const targetBranchId = branchId || payloadData.branchId;
//                 adminConditions = and(
//                     eq(restrauntadmin.restaurantId, recipientId),
//                     eq(restrauntadmin.status, "active"),
//                     or(
//                         eq(restrauntadmin.branchId, targetBranchId),
//                         eq(restrauntadmin.type, "owner"),
//                         eq(restrauntadmin.type, "subadmin")
//                     )
//                 );
//             }
//             const admins = await db
//                 .select({
//                     id: restrauntadmin.id,
//                     fcmToken: restrauntadmin.fcmToken,
//                     firebaseProject: restrauntadmin.firebaseProject
//                 })
//                 .from(restrauntadmin)
//                 .where(adminConditions);
//             for (const adm of admins) {
//                 if (!adm.fcmToken) continue;
//                 add({
//                     token: adm.fcmToken,
//                     project: (adm.firebaseProject as FirebaseProjectKey) || "primary",
//                     persistCorrection: async (correct) => {
//                         await db.update(restrauntadmin).set({ firebaseProject: correct }).where(eq(restrauntadmin.id, adm.id));
//                     },
//                     onDeadToken: async () => {
//                         await db.update(restrauntadmin).set({ fcmToken: null }).where(eq(restrauntadmin.id, adm.id));
//                     }
//                 });
//             }
//         }
//         if (records.length > 0) {
//             const message = {
//                 notification: { title, body },
//                 data: { payload: JSON.stringify(payloadData) },
//                 apns: { payload: { aps: { sound: "notification_sound.wav" } } },
//             };
//             await Promise.all(records.map((record) => sendWithAutoHeal(record, message)));
//             console.log(`[FCM] Notification processed for ${records.length} token(s), ${recipientType} ${recipientId}`);
//         } else {
//             console.log(`[FCM] Skipped push: No FCM token found for ${recipientType} ${recipientId}`);
//         }
//     } catch (error) {
//         console.error(`[FCM] Failed to send push notification to ${recipientType} ${recipientId}:`, error);
//     }
// };
