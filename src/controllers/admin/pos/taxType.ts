import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { taxTypes } from "../../../models/schema";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, ForbiddenError } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";

/**
 * Helper to get and validate authenticated restaurant ID
 */
const getAuthenticatedRestaurantId = (req: Request): string => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new BadRequest("Restaurant context is missing or unauthorized");
    }
    return String(restaurantId);
};

/**
 * 1. Show TaxType for authenticated restaurant
 * GET /api/admin/pos/tax-type
 * GET /api/admin/pos/tax-type/:restrauntid
 */
export const getTaxType = async (req: Request, res: Response) => {
    const restaurantId = getAuthenticatedRestaurantId(req);

    // Prevent viewing any other restaurant
    const requestedId = req.params.restrauntid || req.params.restaurantId;
    if (requestedId && requestedId !== restaurantId) {
        throw new ForbiddenError("You are not authorized to view tax settings of another restaurant");
    }

    const [record] = await db
        .select()
        .from(taxTypes)
        .where(eq(taxTypes.restrauntid, restaurantId))
        .limit(1);

    return SuccessResponse(res, record || null, 200);
};

/**
 * 2. Create if null, update if exist (Upsert) for authenticated restaurant
 * POST /api/admin/pos/tax-type
 * PUT  /api/admin/pos/tax-type
 */
export const upsertTaxType = async (req: Request, res: Response) => {
    const restaurantId = getAuthenticatedRestaurantId(req);

    // Prevent modifying any other restaurant
    const requestedId =
        req.params.restrauntid ||
        req.params.restaurantId ||
        req.body.restrauntid ||
        req.body.restaurantId;

    if (requestedId && requestedId !== restaurantId) {
        throw new ForbiddenError("You are not authorized to modify tax settings of another restaurant");
    }

    const { type } = req.body;
    if (!type || !["include", "exclude"].includes(type)) {
        throw new BadRequest("Type is required and must be either 'include' or 'exclude'");
    }

    // Check if record already exists for this restaurant
    const [existing] = await db
        .select()
        .from(taxTypes)
        .where(eq(taxTypes.restrauntid, restaurantId))
        .limit(1);

    let resultRecord;
    let statusCode = 200;

    if (existing) {
        // Update existing record
        await db
            .update(taxTypes)
            .set({
                type,
                updatedAt: new Date(),
            })
            .where(eq(taxTypes.id, existing.id));

        const [updated] = await db
            .select()
            .from(taxTypes)
            .where(eq(taxTypes.id, existing.id))
            .limit(1);

        resultRecord = updated;
        statusCode = 200;
    } else {
        // Create new record
        const newId = uuidv4();
        await db.insert(taxTypes).values({
            id: newId,
            restrauntid: restaurantId,
            type,
        });

        const [created] = await db
            .select()
            .from(taxTypes)
            .where(eq(taxTypes.id, newId))
            .limit(1);

        resultRecord = created;
        statusCode = 201;
    }

    return SuccessResponse(res, resultRecord, statusCode);
};

// Aliases
export const getTaxTypeByRestaurantId = getTaxType;
export const showTaxType = getTaxType;
export const createTaxType = upsertTaxType;
export const updateTaxType = upsertTaxType;
