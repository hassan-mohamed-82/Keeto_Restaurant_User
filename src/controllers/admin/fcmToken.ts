import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restaurants, restrauntadmin } from "../../models/schema";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { BadRequest } from "../../Errors/BadRequest";

// ==========================================
// Update FCM Token for Admin
// ==========================================
export const updateFcmToken = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const { fcmToken } = req.body;

    if (!fcmToken) {
        throw new BadRequest("FCM Token is required");
    }

    if (req.user.type === "owner") {
        // Main restaurant owner
        await db.update(restaurants)
            .set({ fcmToken })
            .where(eq(restaurants.id, req.user.restaurantId));
    } else {
        // Sub-admin or branch manager
        await db.update(restrauntadmin)
            .set({ fcmToken })
            .where(eq(restrauntadmin.id, req.user.id));
    }

    return SuccessResponse(res, { message: "FCM token updated successfully" });
};
