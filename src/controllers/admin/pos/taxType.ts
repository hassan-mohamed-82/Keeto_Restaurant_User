import { Request, Response } from "express";
import { db } from "../../../models/connection";
import { taxTypes, restaurants } from "../../../models/schema";
import { eq } from "drizzle-orm";
import { SuccessResponse } from "../../../utils/response";
import { BadRequest, NotFound } from "../../../Errors";
import { v4 as uuidv4 } from "uuid";

/**
 * 1. Show TaxType by restaurant ID
 * GET /api/admin/pos/tax-type/:restrauntid
 * GET /api/admin/pos/tax-type
 */
export const getTaxTypeByRestaurantId = async (req: Request, res: Response) => {
    const restaurantId =
        req.params.restrauntid ||
        req.params.restaurantId ||
        req.query.restrauntid ||
        req.query.restaurantId ||
        req.user?.restaurantId ||
        req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const [restaurant] = await db
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(eq(restaurants.id, String(restaurantId)))
        .limit(1);

    if (!restaurant) {
        throw new NotFound("Restaurant not found");
    }

    const [record] = await db
        .select()
        .from(taxTypes)
        .where(eq(taxTypes.restrauntid, String(restaurantId)))
        .limit(1);

    if (!record) {
        return SuccessResponse(res, null, 200);
    }

    return SuccessResponse(res, record, 200);
};

/**
 * 2. Create if null, update if exist (Upsert)
 * POST /api/admin/pos/tax-type
 * PUT  /api/admin/pos/tax-type
 */
export const upsertTaxType = async (req: Request, res: Response) => {
    const restaurantId =
        req.body.restrauntid ||
        req.body.restaurantId ||
        req.params.restrauntid ||
        req.params.restaurantId ||
        req.query.restrauntid ||
        req.query.restaurantId ||
        req.user?.restaurantId ||
        req.user?.id;

    if (!restaurantId) {
        throw new BadRequest("Restaurant ID is required");
    }

    const { type } = req.body;
    if (!type || !["include", "exclude"].includes(type)) {
        throw new BadRequest("Type is required and must be either 'include' or 'exclude'");
    }

    // Verify restaurant exists
    const [restaurant] = await db
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(eq(restaurants.id, String(restaurantId)))
        .limit(1);

    if (!restaurant) {
        throw new NotFound("Restaurant not found");
    }

    // Check if record exists
    const [existing] = await db
        .select()
        .from(taxTypes)
        .where(eq(taxTypes.restrauntid, String(restaurantId)))
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
            restrauntid: String(restaurantId),
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

// Aliases for convenience
export const showTaxType = getTaxTypeByRestaurantId;
export const createTaxType = upsertTaxType;
export const updateTaxType = upsertTaxType;
