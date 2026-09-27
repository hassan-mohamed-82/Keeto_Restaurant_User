"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeAdminFcmToken = exports.updateAdminFcmToken = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
// ==========================================
// 6. Update Admin FCM Token (Single Device Ownership)
// ==========================================
const updateAdminFcmToken = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const { fcmToken } = req.body;
    const tokenToSave = fcmToken && String(fcmToken).trim() !== "" ? String(fcmToken).trim() : null;
    if (tokenToSave) {
        // تفريغ هذا التوكن من أي حساب أدمن آخر فوراً لمنع وصول إشعارات المطاعم الأخرى لنفس الجهاز
        await connection_1.db
            .update(schema_1.restrauntadmin)
            .set({ fcmToken: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.fcmToken, tokenToSave), (0, drizzle_orm_1.ne)(schema_1.restrauntadmin.id, req.user.id)));
    }
    await connection_1.db
        .update(schema_1.restrauntadmin)
        .set({ fcmToken: tokenToSave })
        .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, req.user.id));
    return (0, response_1.SuccessResponse)(res, {
        message: tokenToSave ? "FCM token updated successfully" : "FCM token removed successfully"
    });
};
exports.updateAdminFcmToken = updateAdminFcmToken;
// ==========================================
// 7. Remove Admin FCM Token
// ==========================================
const removeAdminFcmToken = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    await connection_1.db
        .update(schema_1.restrauntadmin)
        .set({ fcmToken: null })
        .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, req.user.id));
    return (0, response_1.SuccessResponse)(res, {
        message: "FCM token removed successfully"
    });
};
exports.removeAdminFcmToken = removeAdminFcmToken;
