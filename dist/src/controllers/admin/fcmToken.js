"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateFcmToken = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const Errors_1 = require("../../Errors");
// ==========================================
// Update FCM Token for Admin
// ==========================================
const updateFcmToken = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const { fcmToken } = req.body;
    const tokenToSave = fcmToken && String(fcmToken).trim() !== "" ? String(fcmToken).trim() : null;
    if (req.user.type === "owner") {
        // Main restaurant owner
        await connection_1.db.update(schema_1.restaurants)
            .set({ fcmToken: tokenToSave })
            .where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, req.user.restaurantId));
    }
    else {
        // Sub-admin or branch manager
        await connection_1.db.update(schema_1.restrauntadmin)
            .set({ fcmToken: tokenToSave })
            .where((0, drizzle_orm_1.eq)(schema_1.restrauntadmin.id, req.user.id));
    }
    return (0, response_1.SuccessResponse)(res, { message: tokenToSave ? "FCM token updated successfully" : "FCM token removed successfully" });
};
exports.updateFcmToken = updateFcmToken;
