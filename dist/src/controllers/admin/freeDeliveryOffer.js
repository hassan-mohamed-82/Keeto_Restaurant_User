"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFreeDeliveryOffer = exports.upsertFreeDeliveryOffer = exports.getFreeDeliveryOffer = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const Errors_1 = require("../../Errors");
const uuid_1 = require("uuid");
const getAdminRestaurantId = (req) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Not authenticated");
    const restaurantId = req.user.restaurantId || req.user.id || req.user?.branchId;
    if (!restaurantId)
        throw new BadRequest_1.BadRequest("Restaurant ID not found");
    return restaurantId;
};
// ==========================================
// 1. Get Free Delivery Offer for Restaurant
// ==========================================
const getFreeDeliveryOffer = async (req, res) => {
    const restaurantId = getAdminRestaurantId(req);
    const [offer] = await connection_1.db
        .select()
        .from(schema_1.freeDeliveryOffers)
        .where((0, drizzle_orm_1.eq)(schema_1.freeDeliveryOffers.restaurantId, restaurantId))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Free delivery offer fetched successfully",
        data: offer || null,
    });
};
exports.getFreeDeliveryOffer = getFreeDeliveryOffer;
// ==========================================
// 2. Create / Update (Upsert) Free Delivery Offer
// ==========================================
const upsertFreeDeliveryOffer = async (req, res) => {
    const restaurantId = getAdminRestaurantId(req);
    const { status, minOrderAmount, startDate, endDate } = req.body;
    if (status && !["active", "inactive"].includes(status)) {
        throw new BadRequest_1.BadRequest("Status must be 'active' or 'inactive'");
    }
    const minAmount = minOrderAmount !== undefined ? parseFloat(String(minOrderAmount)) : 0;
    if (isNaN(minAmount) || minAmount < 0) {
        throw new BadRequest_1.BadRequest("minOrderAmount must be a non-negative number");
    }
    let parsedStartDate = null;
    let parsedEndDate = null;
    if (startDate) {
        parsedStartDate = new Date(startDate);
        if (isNaN(parsedStartDate.getTime())) {
            throw new BadRequest_1.BadRequest("Invalid startDate format");
        }
    }
    if (endDate) {
        parsedEndDate = new Date(endDate);
        if (isNaN(parsedEndDate.getTime())) {
            throw new BadRequest_1.BadRequest("Invalid endDate format");
        }
    }
    if (parsedStartDate && parsedEndDate && parsedEndDate <= parsedStartDate) {
        throw new BadRequest_1.BadRequest("endDate must be after startDate");
    }
    // Check existing offer for this restaurant
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.freeDeliveryOffers)
        .where((0, drizzle_orm_1.eq)(schema_1.freeDeliveryOffers.restaurantId, restaurantId))
        .limit(1);
    if (existing) {
        await connection_1.db
            .update(schema_1.freeDeliveryOffers)
            .set({
            status: status || existing.status,
            minOrderAmount: minAmount.toFixed(2),
            startDate: startDate !== undefined ? parsedStartDate : existing.startDate,
            endDate: endDate !== undefined ? parsedEndDate : existing.endDate,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.freeDeliveryOffers.id, existing.id));
    }
    else {
        await connection_1.db.insert(schema_1.freeDeliveryOffers).values({
            id: (0, uuid_1.v4)(),
            restaurantId,
            status: status || "active",
            minOrderAmount: minAmount.toFixed(2),
            startDate: parsedStartDate,
            endDate: parsedEndDate,
        });
    }
    const [updated] = await connection_1.db
        .select()
        .from(schema_1.freeDeliveryOffers)
        .where((0, drizzle_orm_1.eq)(schema_1.freeDeliveryOffers.restaurantId, restaurantId))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, {
        message: "Free delivery offer updated successfully",
        data: updated,
    });
};
exports.upsertFreeDeliveryOffer = upsertFreeDeliveryOffer;
// ==========================================
// 3. Delete / Reset Free Delivery Offer
// ==========================================
const deleteFreeDeliveryOffer = async (req, res) => {
    const restaurantId = getAdminRestaurantId(req);
    await connection_1.db
        .delete(schema_1.freeDeliveryOffers)
        .where((0, drizzle_orm_1.eq)(schema_1.freeDeliveryOffers.restaurantId, restaurantId));
    return (0, response_1.SuccessResponse)(res, {
        message: "Free delivery offer deleted successfully",
    });
};
exports.deleteFreeDeliveryOffer = deleteFreeDeliveryOffer;
