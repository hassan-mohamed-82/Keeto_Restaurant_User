import { Request, Response } from "express";
import { db } from "../../models/connection";
import { freeDeliveryOffers, branches } from "../../models/schema";
import { eq, and, inArray } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import { v4 as uuidv4 } from "uuid";
import { parseJsonArray } from "../../helpers/localization.helper";

const getAdminRestaurantId = (req: Request): string => {
    if (!req.user) throw new UnauthorizedError("Not authenticated");
    const restaurantId = req.user.restaurantId || req.user.id || req.user?.branchId;
    if (!restaurantId) throw new BadRequest("Restaurant ID not found");
    return restaurantId;
};

// ==========================================
// 1. Get Free Delivery Offer for Restaurant
// ==========================================
export const getFreeDeliveryOffer = async (req: Request, res: Response) => {
    const restaurantId = getAdminRestaurantId(req);

    const [offer] = await db
        .select()
        .from(freeDeliveryOffers)
        .where(eq(freeDeliveryOffers.restaurantId, restaurantId))
        .limit(1);

    if (!offer) {
        return SuccessResponse(res, {
            message: "Free delivery offer fetched successfully",
            data: null,
        });
    }

    const branchIds = parseJsonArray(offer.branchIds);
    let branchesData: Array<{ id: string; name: string; nameAr: string | null; nameFr: string | null }> = [];
    if (branchIds.length > 0) {
        branchesData = await db
            .select({
                id: branches.id,
                name: branches.name,
                nameAr: branches.nameAr,
                nameFr: branches.nameFr,
            })
            .from(branches)
            .where(
                and(
                    eq(branches.restaurantId, restaurantId),
                    inArray(branches.id, branchIds)
                )
            );
    }

    return SuccessResponse(res, {
        message: "Free delivery offer fetched successfully",
        data: {
            ...offer,
            branches: branchesData,
        },
    });
};

// ==========================================
// 2. Create / Update (Upsert) Free Delivery Offer
// ==========================================
export const upsertFreeDeliveryOffer = async (req: Request, res: Response) => {
    const restaurantId = getAdminRestaurantId(req);
    const { status, minOrderAmount, maxOrdersPerUser, startDate, endDate, branchIds, branch_ids } = req.body;

    if (status && !["active", "inactive"].includes(status)) {
        throw new BadRequest("Status must be 'active' or 'inactive'");
    }

    const minAmount = minOrderAmount !== undefined ? parseFloat(String(minOrderAmount)) : 0;
    if (isNaN(minAmount) || minAmount < 0) {
        throw new BadRequest("minOrderAmount must be a non-negative number");
    }

    let parsedMaxOrdersPerUser: number | null = null;
    if (maxOrdersPerUser !== undefined && maxOrdersPerUser !== null) {
        parsedMaxOrdersPerUser = parseInt(String(maxOrdersPerUser), 10);
        if (isNaN(parsedMaxOrdersPerUser) || parsedMaxOrdersPerUser < 1) {
            throw new BadRequest("maxOrdersPerUser must be an integer >= 1");
        }
    }

    let parsedStartDate: Date | null = null;
    let parsedEndDate: Date | null = null;

    if (startDate) {
        parsedStartDate = new Date(startDate);
        if (isNaN(parsedStartDate.getTime())) {
            throw new BadRequest("Invalid startDate format");
        }
    }

    if (endDate) {
        parsedEndDate = new Date(endDate);
        if (isNaN(parsedEndDate.getTime())) {
            throw new BadRequest("Invalid endDate format");
        }
    }

    if (parsedStartDate && parsedEndDate && parsedEndDate <= parsedStartDate) {
        throw new BadRequest("endDate must be after startDate");
    }

    const rawBranchIds = branchIds !== undefined ? branchIds : branch_ids;
    let parsedBranchIds: string[] | undefined = undefined;
    if (rawBranchIds !== undefined) {
        parsedBranchIds = parseJsonArray(rawBranchIds);

        // If branches were selected, verify they belong to this restaurant
        if (parsedBranchIds.length > 0) {
            const foundBranches = await db
                .select({ id: branches.id })
                .from(branches)
                .where(
                    and(
                        eq(branches.restaurantId, restaurantId),
                        inArray(branches.id, parsedBranchIds)
                    )
                );
            if (foundBranches.length !== parsedBranchIds.length) {
                throw new BadRequest("One or more selected branches do not belong to this restaurant");
            }
        }
    }

    // Check existing offer for this restaurant
    const [existing] = await db
        .select()
        .from(freeDeliveryOffers)
        .where(eq(freeDeliveryOffers.restaurantId, restaurantId))
        .limit(1);

    if (existing) {
        await db
            .update(freeDeliveryOffers)
            .set({
                status: status || existing.status,
                minOrderAmount: minAmount.toFixed(2),
                maxOrdersPerUser: maxOrdersPerUser !== undefined ? parsedMaxOrdersPerUser : existing.maxOrdersPerUser,
                startDate: startDate !== undefined ? parsedStartDate : existing.startDate,
                endDate: endDate !== undefined ? parsedEndDate : existing.endDate,
                branchIds: parsedBranchIds !== undefined ? parsedBranchIds : (existing.branchIds ?? []),
                updatedAt: new Date(),
            })
            .where(eq(freeDeliveryOffers.id, existing.id));
    } else {
        await db.insert(freeDeliveryOffers).values({
            id: uuidv4(),
            restaurantId,
            status: status || "active",
            minOrderAmount: minAmount.toFixed(2),
            maxOrdersPerUser: parsedMaxOrdersPerUser,
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            branchIds: parsedBranchIds ?? [],
        });
    }

    const [updated] = await db
        .select()
        .from(freeDeliveryOffers)
        .where(eq(freeDeliveryOffers.restaurantId, restaurantId))
        .limit(1);

    const updatedBranchIds = parseJsonArray(updated?.branchIds);
    let branchesData: Array<{ id: string; name: string; nameAr: string | null; nameFr: string | null }> = [];
    if (updatedBranchIds.length > 0) {
        branchesData = await db
            .select({
                id: branches.id,
                name: branches.name,
                nameAr: branches.nameAr,
                nameFr: branches.nameFr,
            })
            .from(branches)
            .where(
                and(
                    eq(branches.restaurantId, restaurantId),
                    inArray(branches.id, updatedBranchIds)
                )
            );
    }

    return SuccessResponse(res, {
        message: "Free delivery offer updated successfully",
        data: updated
            ? {
                  ...updated,
                  branches: branchesData,
              }
            : null,
    });
};

// ==========================================
// 3. Delete / Reset Free Delivery Offer
// ==========================================
export const deleteFreeDeliveryOffer = async (req: Request, res: Response) => {
    const restaurantId = getAdminRestaurantId(req);

    await db
        .delete(freeDeliveryOffers)
        .where(eq(freeDeliveryOffers.restaurantId, restaurantId));

    return SuccessResponse(res, {
        message: "Free delivery offer deleted successfully",
    });
};
