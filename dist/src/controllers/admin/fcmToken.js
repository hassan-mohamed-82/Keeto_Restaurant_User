"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAdminFcmToken = void 0;
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
const BadRequest_1 = require("../../Errors/BadRequest");
const adminTokens_1 = require("../../utils/adminTokens");
const updateAdminFcmToken = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const { fcmToken, deviceType } = req.body;
    const tokenToSave = fcmToken && String(fcmToken).trim() !== "" ? String(fcmToken).trim() : null;
    const devType = (0, adminTokens_1.parseDeviceType)(deviceType);
    if (tokenToSave) {
        if (!devType)
            throw new BadRequest_1.BadRequest("deviceType (android | ios | web) is required");
        await (0, adminTokens_1.registerAdminToken)(req.user.id, tokenToSave, devType);
    }
    else {
        await (0, adminTokens_1.removeAdminToken)(req.user.id, devType);
    }
    return (0, response_1.SuccessResponse)(res, {
        message: tokenToSave ? "FCM token updated successfully" : "FCM token removed successfully"
    });
};
exports.updateAdminFcmToken = updateAdminFcmToken;
