import { Request, Response } from "express";
import { SuccessResponse } from "../../utils/response";
import { UnauthorizedError } from "../../Errors";
import { BadRequest } from "../../Errors/BadRequest";
import { registerAdminToken, removeAdminToken, parseDeviceType } from "../../utils/adminTokens";

export const updateAdminFcmToken = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const { fcmToken, deviceType } = req.body;

    const tokenToSave = fcmToken && String(fcmToken).trim() !== "" ? String(fcmToken).trim() : null;
    const devType = parseDeviceType(deviceType);

    if (tokenToSave) {
        if (!devType) throw new BadRequest("deviceType (android | ios | web) is required");
        await registerAdminToken(req.user.id, tokenToSave, devType);
    } else {
        await removeAdminToken(req.user.id, devType);
    }

    return SuccessResponse(res, {
        message: tokenToSave ? "FCM token updated successfully" : "FCM token removed successfully"
    });
};