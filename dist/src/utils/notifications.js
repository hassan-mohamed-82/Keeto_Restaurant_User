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
 *
 * For "restaurant" recipients:
 *   - Saves ONE notification record (linked to the restaurant).
 *   - Sends FCM push to ALL admins of that restaurant who have FCM tokens.
 *   - If branchId is provided in data, also specifically targets branch managers.
 */
const sendPushNotification = async (params) => {
    const { recipientType, recipientId, title, body, data } = params;
    // 1. Save notification to database regardless of FCM success/failure
    await connection_1.db.insert(schema_1.notifications).values({
        id: (0, uuid_1.v4)(),
        recipientType,
        recipientId,
        title,
        body,
        data: data || {},
    });
    try {
        // 2. Look up the FCM token(s) for the recipient
        if (recipientType === "user") {
            // Single user → single token
            const [user] = await connection_1.db
                .select({ fcmToken: schema_1.users.fcmToken })
                .from(schema_1.users)
                .where((0, drizzle_orm_1.eq)(schema_1.users.id, recipientId))
                .limit(1);
            const fcmToken = user?.fcmToken || null;
            if (fcmToken) {
                await firebase_1.messaging.send({
                    notification: { title, body },
                    data: { payload: JSON.stringify(data || {}) },
                    token: fcmToken,
                });
                console.log(`[FCM] Notification sent successfully to user ${recipientId}`);
            }
            else {
                console.log(`[FCM] Skipped push: No FCM token found for user ${recipientId}`);
            }
        }
        else {
            // Restaurant → send to ALL admins (owner, subadmins, branch managers)
            const branchId = data?.branchId || null;
            // Build query conditions: all admins of this restaurant who have FCM tokens
            const conditions = [
                (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.restaurantId, recipientId),
                (0, drizzle_orm_1.eq)(schema_1.restrauntadmin.status, "active"),
                (0, drizzle_orm_1.isNotNull)(schema_1.restrauntadmin.fcmToken),
            ];
            const adminTokens = await connection_1.db
                .select({
                id: schema_1.restrauntadmin.id,
                fcmToken: schema_1.restrauntadmin.fcmToken,
                type: schema_1.restrauntadmin.type,
                branchId: schema_1.restrauntadmin.branchId
            })
                .from(schema_1.restrauntadmin)
                .where((0, drizzle_orm_1.and)(...conditions));
            // Also get the main restaurant owner's token (stored in the restaurants table)
            const [restaurant] = await connection_1.db
                .select({ fcmToken: schema_1.restaurants.fcmToken })
                .from(schema_1.restaurants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurants.id, recipientId), (0, drizzle_orm_1.isNotNull)(schema_1.restaurants.fcmToken)))
                .limit(1);
            const allTokens = new Set();
            if (restaurant?.fcmToken && restaurant.fcmToken.trim() !== "") {
                allTokens.add(restaurant.fcmToken);
            }
            // Filter: send to owner/subadmins (they see all), 
            // AND branch managers of the specific branch (if branchId exists)
            const relevantAdmins = adminTokens.filter(admin => {
                // Owner & subadmins always get notifications
                if (admin.type === "owner" || admin.type === "subadmin")
                    return true;
                // Branch managers only get notified if the order is for their branch
                if (branchId && admin.branchId === branchId)
                    return true;
                // If no branchId specified, notify all branch managers too
                if (!branchId)
                    return true;
                return false;
            });
            // Add relevant admin tokens
            for (const admin of relevantAdmins) {
                if (admin.fcmToken && admin.fcmToken.trim() !== "") {
                    allTokens.add(admin.fcmToken);
                }
            }
            if (allTokens.size === 0) {
                console.log(`[FCM] Skipped push: No active admins with FCM tokens for restaurant ${recipientId}`);
                return;
            }
            // Send push to each relevant token
            let sentCount = 0;
            for (const token of allTokens) {
                try {
                    await firebase_1.messaging.send({
                        notification: { title, body },
                        data: { payload: JSON.stringify(data || {}) },
                        token: token,
                    });
                    sentCount++;
                }
                catch (tokenError) {
                    // Token might be expired/invalid, log and continue
                    console.error(`[FCM] Failed to send to token:`, tokenError?.message);
                }
            }
            console.log(`[FCM] Notification sent to ${sentCount}/${allTokens.size} devices for restaurant ${recipientId}`);
        }
    }
    catch (error) {
        console.error(`[FCM] Failed to send push notification to ${recipientType} ${recipientId}:`, error);
        // We don't throw the error so that the main business logic (like checkout) doesn't fail 
        // just because a notification failed to send.
    }
};
exports.sendPushNotification = sendPushNotification;
