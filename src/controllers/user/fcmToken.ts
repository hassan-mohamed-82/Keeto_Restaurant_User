import { Request, Response } from "express";
import { db } from "../../models/connection";
import { users, userFcmTokens, restaurants } from "../../models/schema";
import { eq, and } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { v4 as uuidv4 } from "uuid";

// ==========================================
// Update FCM Token for User 
// ==========================================
export const updateFcmToken = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const userId = req.user.id;
    const { fcmToken, restaurantId, deviceType } = req.body;

    const tokenToSave = fcmToken && String(fcmToken).trim() !== "" ? String(fcmToken).trim() : null;
    const devType = deviceType || "web";

    // 1. Update fallback token in main users table
    await db.update(users)
        .set({ fcmToken: tokenToSave })
        .where(eq(users.id, userId));

    // 2. Manage user_fcm_tokens table
    if (restaurantId) {
        if (tokenToSave) {
            const [restaurant] = await db
                .select({
                    ios: restaurants.iosFirebaseProject,
                    android: restaurants.androidFirebaseProject,
                })
                .from(restaurants)
                .where(eq(restaurants.id, restaurantId))
                .limit(1);

            let projectToSave = "primary";
            if (restaurant) {
                projectToSave = devType === "ios" ? (restaurant.ios || "primary") : (restaurant.android || "primary");
            }

            const [existing] = await db
                .select()
                .from(userFcmTokens)
                .where(and(
                    eq(userFcmTokens.userId, userId),
                    eq(userFcmTokens.restaurantId, restaurantId)
                ))
                .limit(1);

            if (existing) {
                await db.update(userFcmTokens)
                    .set({
                        fcmToken: tokenToSave,
                        deviceType: devType,
                        firebaseProject: projectToSave,
                        updatedAt: new Date()
                    })
                    .where(eq(userFcmTokens.id, existing.id));
            } else {
                await db.insert(userFcmTokens).values({
                    id: uuidv4(),
                    userId,
                    restaurantId,
                    fcmToken: tokenToSave,
                    deviceType: devType,
                    firebaseProject: projectToSave
                });
            }
        } else {
            await db.delete(userFcmTokens)
                .where(and(
                    eq(userFcmTokens.userId, userId),
                    eq(userFcmTokens.restaurantId, restaurantId)
                ));
        }
    } else if (!tokenToSave) {
        await db.delete(userFcmTokens)
            .where(eq(userFcmTokens.userId, userId));
    }

    return SuccessResponse(res, { message: tokenToSave ? "FCM token updated successfully" : "FCM token removed successfully" });
};
