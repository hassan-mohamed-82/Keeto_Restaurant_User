import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restaurants, restrauntadmin } from "../../models/schema";
import { and, eq, ne } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { BadRequest } from "../../Errors/BadRequest";
// ==========================================
// Update Admin FCM Token
// ==========================================
export const updateAdminFcmToken = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const { fcmToken, deviceType } = req.body;
    const devType = deviceType || "web";

    const tokenToSave = fcmToken && String(fcmToken).trim() !== "" ? String(fcmToken).trim() : null;
    let projectToSave = "primary";

    if (tokenToSave) {
        await db
            .update(restrauntadmin)
            .set({ fcmToken: null })
            .where(and(
                eq(restrauntadmin.fcmToken, tokenToSave),
                ne(restrauntadmin.id, req.user.id)
            ));

        if (req.user.restaurantId) {
            const [restData] = await db.select({ ios: restaurants.iosFirebaseProject, android: restaurants.androidFirebaseProject })
                .from(restaurants).where(eq(restaurants.id, req.user.restaurantId)).limit(1);
            if (restData) {
                projectToSave = devType === "ios" ? (restData.ios || "primary") : (restData.android || "primary");
            }
        }
    }

    await db
        .update(restrauntadmin)
        .set({
            fcmToken: tokenToSave,
            deviceType: devType,
            firebaseProject: projectToSave
        })
        .where(eq(restrauntadmin.id, req.user.id));

    return SuccessResponse(res, {
        message: tokenToSave ? "FCM token updated successfully" : "FCM token removed successfully"
    });
};