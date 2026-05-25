import { messaging } from "./firebase";
import { db } from "../models/connection";
import { notifications, users, restaurants, restrauntadmin } from "../models/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

/**
 * Utility to send a push notification via Firebase and save it to the DB.
 * 
 * For "restaurant" recipients:
 *   - Saves ONE notification record (linked to the restaurant).
 *   - Sends FCM push to ALL admins of that restaurant who have FCM tokens.
 *   - If branchId is provided in data, also specifically targets branch managers.
 */
export const sendPushNotification = async (params: {
    recipientType: "user" | "restaurant";
    recipientId: string;
    title: string;
    body: string;
    data?: any; // Extra payload data
}) => {
    const { recipientType, recipientId, title, body, data } = params;

    // 1. Save notification to database regardless of FCM success/failure
    await db.insert(notifications).values({
        id: uuidv4(),
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
            const [user] = await db
                .select({ fcmToken: users.fcmToken })
                .from(users)
                .where(eq(users.id, recipientId))
                .limit(1);

            const fcmToken = user?.fcmToken || null;

            if (fcmToken) {
                await messaging.send({
                    notification: { title, body },
                    data: { payload: JSON.stringify(data || {}) },
                    token: fcmToken,
                });
                console.log(`[FCM] Notification sent successfully to user ${recipientId}`);
            } else {
                console.log(`[FCM] Skipped push: No FCM token found for user ${recipientId}`);
            }

        } else {
            // Restaurant → send to ALL admins (owner, subadmins, branch managers)
            const branchId = data?.branchId || null;

            // Build query conditions: all admins of this restaurant who have FCM tokens
            const conditions = [
                eq(restrauntadmin.restaurantId, recipientId),
                eq(restrauntadmin.status, "active"),
                isNotNull(restrauntadmin.fcmToken),
            ];

            const adminTokens = await db
                .select({ 
                    id: restrauntadmin.id,
                    fcmToken: restrauntadmin.fcmToken, 
                    type: restrauntadmin.type,
                    branchId: restrauntadmin.branchId 
                })
                .from(restrauntadmin)
                .where(and(...conditions));

            // Also get the main restaurant owner's token (stored in the restaurants table)
            const [restaurant] = await db
                .select({ fcmToken: restaurants.fcmToken })
                .from(restaurants)
                .where(and(eq(restaurants.id, recipientId), isNotNull(restaurants.fcmToken)))
                .limit(1);

            const allTokens = new Set<string>();

            if (restaurant?.fcmToken && restaurant.fcmToken.trim() !== "") {
                allTokens.add(restaurant.fcmToken);
            }

            // Filter: send to owner/subadmins (they see all), 
            // AND branch managers of the specific branch (if branchId exists)
            const relevantAdmins = adminTokens.filter(admin => {
                // Owner & subadmins always get notifications
                if (admin.type === "owner" || admin.type === "subadmin") return true;
                // Branch managers only get notified if the order is for their branch
                if (branchId && admin.branchId === branchId) return true;
                // If no branchId specified, notify all branch managers too
                if (!branchId) return true;
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
                    await messaging.send({
                        notification: { title, body },
                        data: { payload: JSON.stringify(data || {}) },
                        token: token,
                    });
                    sentCount++;
                } catch (tokenError: any) {
                    // Token might be expired/invalid, log and continue
                    console.error(`[FCM] Failed to send to token:`, tokenError?.message);
                }
            }
            console.log(`[FCM] Notification sent to ${sentCount}/${allTokens.size} devices for restaurant ${recipientId}`);
        }
    } catch (error) {
        console.error(`[FCM] Failed to send push notification to ${recipientType} ${recipientId}:`, error);
        // We don't throw the error so that the main business logic (like checkout) doesn't fail 
        // just because a notification failed to send.
    }
};
