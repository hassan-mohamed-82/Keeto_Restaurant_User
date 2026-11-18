"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmWeightRequestSchema = exports.rejectWeightRequestSchema = exports.replaceRestaurantItemsSchema = exports.restaurantItemInputSchema = exports.patchWeightItemBodySchema = exports.patchWeightItemParamSchema = exports.getWeightRequestParamSchema = exports.getWeightRequestsQuerySchema = void 0;
const zod_1 = require("zod");
exports.getWeightRequestsQuerySchema = zod_1.z.object({
    status: zod_1.z.enum([
        "awaiting_weighing",
        "awaiting_customer_approval",
        "approved",
        "cancelled",
        "expired",
    ]).optional(),
    branchId: zod_1.z.string().uuid("Invalid branch ID").optional(),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional().default(20),
});
exports.getWeightRequestParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid("Invalid weight request ID"),
});
exports.patchWeightItemParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid("Invalid weight request ID"),
    cartItemId: zod_1.z.string().uuid("Invalid cart item ID"),
});
exports.patchWeightItemBodySchema = zod_1.z.object({
    finalWeight: zod_1.z.coerce.number().positive("Final weight must be greater than 0").optional(),
    unitPrice: zod_1.z.coerce.number().positive("Unit price must be greater than 0").optional(),
    unavailable: zod_1.z.boolean().optional(),
    reason: zod_1.z.string().max(500, "Reason cannot exceed 500 characters").optional(),
}).refine((data) => data.finalWeight !== undefined || data.unitPrice !== undefined || data.unavailable !== undefined, { message: "At least one of finalWeight, unitPrice, or unavailable must be provided" });
exports.restaurantItemInputSchema = zod_1.z.object({
    cartItemId: zod_1.z.string().uuid("Invalid cart item ID").optional(),
    foodId: zod_1.z.string().uuid("Invalid food ID"),
    quantity: zod_1.z.coerce.number().int().min(1).optional().default(1),
    weight: zod_1.z.coerce.number().positive("Weight must be greater than 0").optional(),
    unitPrice: zod_1.z.coerce.number().positive("Unit price must be greater than 0").optional(),
    variations: zod_1.z.array(zod_1.z.any()).optional().default([]),
    addons: zod_1.z.array(zod_1.z.any()).optional().default([]),
    note: zod_1.z.string().max(500, "Note cannot exceed 500 characters").optional().nullable(),
});
exports.replaceRestaurantItemsSchema = zod_1.z.object({
    items: zod_1.z.array(exports.restaurantItemInputSchema),
});
exports.rejectWeightRequestSchema = zod_1.z.object({
    reason: zod_1.z.string().max(500, "Reason cannot exceed 500 characters").optional(),
});
/** Optional body of POST /:id/confirm. strict: true = reject unweighed rows (old behaviour). */
exports.confirmWeightRequestSchema = zod_1.z
    .object({ strict: zod_1.z.union([zod_1.z.boolean(), zod_1.z.enum(["true", "false"])]).optional() })
    .optional()
    .default({});
