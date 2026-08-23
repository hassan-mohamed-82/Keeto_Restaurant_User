import { Request, Response } from "express";
import { db } from "../../models/connection";
import { freeDeliveryOffers } from "../../models/schema";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { UnauthorizedError } from "../../Errors";
import { v4 as uuidv4 } from "uuid";

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

    return SuccessResponse(res, {
        message: "Free delivery offer fetched successfully",
        data: offer || null,
    });
};

// ==========================================
// 2. Create / Update (Upsert) Free Delivery Offer
// ==========================================
export const upsertFreeDeliveryOffer = async (req: Request, res: Response) => {
    const restaurantId = getAdminRestaurantId(req);
    const { status, minOrderAmount, startDate, endDate } = req.body;

    if (status && !["active", "inactive"].includes(status)) {
        throw new BadRequest("Status must be 'active' or 'inactive'");
    }

    const minAmount = minOrderAmount !== undefined ? parseFloat(String(minOrderAmount)) : 0;
    if (isNaN(minAmount) || minAmount < 0) {
        throw new BadRequest("minOrderAmount must be a non-negative number");
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
                startDate: startDate !== undefined ? parsedStartDate : existing.startDate,
                endDate: endDate !== undefined ? parsedEndDate : existing.endDate,
                updatedAt: new Date(),
            })
            .where(eq(freeDeliveryOffers.id, existing.id));
    } else {
        await db.insert(freeDeliveryOffers).values({
            id: uuidv4(),
            restaurantId,
            status: status || "active",
            minOrderAmount: minAmount.toFixed(2),
            startDate: parsedStartDate,
            endDate: parsedEndDate,
        });
    }

    const [updated] = await db
        .select()
        .from(freeDeliveryOffers)
        .where(eq(freeDeliveryOffers.restaurantId, restaurantId))
        .limit(1);

    return SuccessResponse(res, {
        message: "Free delivery offer updated successfully",
        data: updated,
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
