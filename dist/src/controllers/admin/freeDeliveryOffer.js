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
const localization_helper_1 = require("../../helpers/localization.helper");
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
    if (!offer) {
        return (0, response_1.SuccessResponse)(res, {
            message: "Free delivery offer fetched successfully",
            data: null,
        });
    }
    const branchIds = (0, localization_helper_1.parseJsonArray)(offer.branchIds);
    let branchesData = [];
    if (branchIds.length > 0) {
        branchesData = await connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.branches.id, branchIds)));
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Free delivery offer fetched successfully",
        data: {
            ...offer,
            branches: branchesData,
        },
    });
};
exports.getFreeDeliveryOffer = getFreeDeliveryOffer;
// ==========================================
// 2. Create / Update (Upsert) Free Delivery Offer
// ==========================================
const upsertFreeDeliveryOffer = async (req, res) => {
    const restaurantId = getAdminRestaurantId(req);
    const { status, minOrderAmount, maxOrdersPerUser, startDate, endDate, branchIds, branch_ids } = req.body;
    if (status && !["active", "inactive"].includes(status)) {
        throw new BadRequest_1.BadRequest("Status must be 'active' or 'inactive'");
    }
    const minAmount = minOrderAmount !== undefined ? parseFloat(String(minOrderAmount)) : 0;
    if (isNaN(minAmount) || minAmount < 0) {
        throw new BadRequest_1.BadRequest("minOrderAmount must be a non-negative number");
    }
    let parsedMaxOrdersPerUser = null;
    if (maxOrdersPerUser !== undefined && maxOrdersPerUser !== null) {
        parsedMaxOrdersPerUser = parseInt(String(maxOrdersPerUser), 10);
        if (isNaN(parsedMaxOrdersPerUser) || parsedMaxOrdersPerUser < 1) {
            throw new BadRequest_1.BadRequest("maxOrdersPerUser must be an integer >= 1");
        }
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
    const rawBranchIds = branchIds !== undefined ? branchIds : branch_ids;
    let parsedBranchIds = undefined;
    if (rawBranchIds !== undefined) {
        parsedBranchIds = (0, localization_helper_1.parseJsonArray)(rawBranchIds);
        // If branches were selected, verify they belong to this restaurant
        if (parsedBranchIds.length > 0) {
            const foundBranches = await connection_1.db
                .select({ id: schema_1.branches.id })
                .from(schema_1.branches)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.branches.id, parsedBranchIds)));
            if (foundBranches.length !== parsedBranchIds.length) {
                throw new BadRequest_1.BadRequest("One or more selected branches do not belong to this restaurant");
            }
        }
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
            maxOrdersPerUser: maxOrdersPerUser !== undefined ? parsedMaxOrdersPerUser : existing.maxOrdersPerUser,
            startDate: startDate !== undefined ? parsedStartDate : existing.startDate,
            endDate: endDate !== undefined ? parsedEndDate : existing.endDate,
            branchIds: parsedBranchIds !== undefined ? parsedBranchIds : (existing.branchIds ?? []),
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
            maxOrdersPerUser: parsedMaxOrdersPerUser,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            branchIds: parsedBranchIds ?? [],
        });
    }
    const [updated] = await connection_1.db
        .select()
        .from(schema_1.freeDeliveryOffers)
        .where((0, drizzle_orm_1.eq)(schema_1.freeDeliveryOffers.restaurantId, restaurantId))
        .limit(1);
    const updatedBranchIds = (0, localization_helper_1.parseJsonArray)(updated?.branchIds);
    let branchesData = [];
    if (updatedBranchIds.length > 0) {
        branchesData = await connection_1.db
            .select({
            id: schema_1.branches.id,
            name: schema_1.branches.name,
            nameAr: schema_1.branches.nameAr,
            nameFr: schema_1.branches.nameFr,
        })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.inArray)(schema_1.branches.id, updatedBranchIds)));
    }
    return (0, response_1.SuccessResponse)(res, {
        message: "Free delivery offer updated successfully",
        data: updated
            ? {
                ...updated,
                branches: branchesData,
            }
            : null,
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
