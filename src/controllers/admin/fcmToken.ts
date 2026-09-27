import { Request, Response } from "express";
import { db } from "../../models/connection";
import { restrauntadmin } from "../../models/schema";
import { and, eq , ne } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { BadRequest } from "../../Errors/BadRequest";

// ==========================================
// 6. Update Admin FCM Token (Single Device Ownership)
// ==========================================
export const updateAdminFcmToken = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const { fcmToken } = req.body;

    const tokenToSave = fcmToken && String(fcmToken).trim() !== "" ? String(fcmToken).trim() : null;

    if (tokenToSave) {
        // تفريغ هذا التوكن من أي حساب أدمن آخر فوراً لمنع وصول إشعارات المطاعم الأخرى لنفس الجهاز
        await db
            .update(restrauntadmin)
            .set({ fcmToken: null })
            .where(and(
                eq(restrauntadmin.fcmToken, tokenToSave),
                ne(restrauntadmin.id, req.user.id)
            ));
    }

    await db
        .update(restrauntadmin)
        .set({ fcmToken: tokenToSave })
        .where(eq(restrauntadmin.id, req.user.id));

    return SuccessResponse(res, {
        message: tokenToSave ? "FCM token updated successfully" : "FCM token removed successfully"
    });
};

// ==========================================
// 7. Remove Admin FCM Token
// ==========================================
export const removeAdminFcmToken = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");

    await db
        .update(restrauntadmin)
        .set({ fcmToken: null })
        .where(eq(restrauntadmin.id, req.user.id));

    return SuccessResponse(res, {
        message: "FCM token removed successfully"
    });
};