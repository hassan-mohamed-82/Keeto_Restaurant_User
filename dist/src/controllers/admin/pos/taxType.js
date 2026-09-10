"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTaxType = exports.createTaxType = exports.showTaxType = exports.getTaxTypeByRestaurantId = exports.upsertTaxType = exports.getTaxType = void 0;
const connection_1 = require("../../../models/connection");
const schema_1 = require("../../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../../utils/response");
const Errors_1 = require("../../../Errors");
const uuid_1 = require("uuid");
/**
 * Helper to get and validate authenticated restaurant ID
 */
const getAuthenticatedRestaurantId = (req) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.BadRequest("Restaurant context is missing or unauthorized");
    }
    return String(restaurantId);
};
/**
 * 1. Show TaxType for authenticated restaurant
 * GET /api/admin/pos/tax-type
 * GET /api/admin/pos/tax-type/:restrauntid
 */
const getTaxType = async (req, res) => {
    const restaurantId = getAuthenticatedRestaurantId(req);
    // Prevent viewing any other restaurant
    const requestedId = req.params.restrauntid || req.params.restaurantId;
    if (requestedId && requestedId !== restaurantId) {
        throw new Errors_1.ForbiddenError("You are not authorized to view tax settings of another restaurant");
    }
    const [record] = await connection_1.db
        .select()
        .from(schema_1.taxTypes)
        .where((0, drizzle_orm_1.eq)(schema_1.taxTypes.restrauntid, restaurantId))
        .limit(1);
    return (0, response_1.SuccessResponse)(res, record || null, 200);
};
exports.getTaxType = getTaxType;
/**
 * 2. Create if null, update if exist (Upsert) for authenticated restaurant
 * POST /api/admin/pos/tax-type
 * PUT  /api/admin/pos/tax-type
 */
const upsertTaxType = async (req, res) => {
    const restaurantId = getAuthenticatedRestaurantId(req);
    // Prevent modifying any other restaurant
    const requestedId = req.params.restrauntid ||
        req.params.restaurantId ||
        req.body.restrauntid ||
        req.body.restaurantId;
    if (requestedId && requestedId !== restaurantId) {
        throw new Errors_1.ForbiddenError("You are not authorized to modify tax settings of another restaurant");
    }
    const { type } = req.body;
    if (!type || !["include", "exclude"].includes(type)) {
        throw new Errors_1.BadRequest("Type is required and must be either 'include' or 'exclude'");
    }
    // Check if record already exists for this restaurant
    const [existing] = await connection_1.db
        .select()
        .from(schema_1.taxTypes)
        .where((0, drizzle_orm_1.eq)(schema_1.taxTypes.restrauntid, restaurantId))
        .limit(1);
    let resultRecord;
    let statusCode = 200;
    if (existing) {
        // Update existing record
        await connection_1.db
            .update(schema_1.taxTypes)
            .set({
            type,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.taxTypes.id, existing.id));
        const [updated] = await connection_1.db
            .select()
            .from(schema_1.taxTypes)
            .where((0, drizzle_orm_1.eq)(schema_1.taxTypes.id, existing.id))
            .limit(1);
        resultRecord = updated;
        statusCode = 200;
    }
    else {
        // Create new record
        const newId = (0, uuid_1.v4)();
        await connection_1.db.insert(schema_1.taxTypes).values({
            id: newId,
            restrauntid: restaurantId,
            type,
        });
        const [created] = await connection_1.db
            .select()
            .from(schema_1.taxTypes)
            .where((0, drizzle_orm_1.eq)(schema_1.taxTypes.id, newId))
            .limit(1);
        resultRecord = created;
        statusCode = 201;
    }
    return (0, response_1.SuccessResponse)(res, resultRecord, statusCode);
};
exports.upsertTaxType = upsertTaxType;
// Aliases
exports.getTaxTypeByRestaurantId = exports.getTaxType;
exports.showTaxType = exports.getTaxType;
exports.createTaxType = exports.upsertTaxType;
exports.updateTaxType = exports.upsertTaxType;
