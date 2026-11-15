import { z } from "zod";

export const getWeightRequestsQuerySchema = z.object({
    status: z.enum([
        "awaiting_weighing",
        "awaiting_customer_approval",
        "approved",
        "cancelled",
        "expired",
    ]).optional(),
    branchId: z.string().uuid("Invalid branch ID").optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const getWeightRequestParamSchema = z.object({
    id: z.string().uuid("Invalid weight request ID"),
});

export const patchWeightItemParamSchema = z.object({
    id: z.string().uuid("Invalid weight request ID"),
    cartItemId: z.string().uuid("Invalid cart item ID"),
});

export const patchWeightItemBodySchema = z.object({
    finalWeight: z.coerce.number().positive("Final weight must be greater than 0").optional(),
    unitPrice: z.coerce.number().positive("Unit price must be greater than 0").optional(),
    unavailable: z.boolean().optional(),
    reason: z.string().max(500, "Reason cannot exceed 500 characters").optional(),
}).refine(
    (data) => data.finalWeight !== undefined || data.unitPrice !== undefined || data.unavailable !== undefined,
    { message: "At least one of finalWeight, unitPrice, or unavailable must be provided" }
);

export const restaurantItemInputSchema = z.object({
    cartItemId: z.string().uuid("Invalid cart item ID").optional(),
    foodId: z.string().uuid("Invalid food ID"),
    quantity: z.coerce.number().int().min(1).optional().default(1),
    weight: z.coerce.number().positive("Weight must be greater than 0").optional(),
    unitPrice: z.coerce.number().positive("Unit price must be greater than 0").optional(),
    variations: z.array(z.any()).optional().default([]),
    addons: z.array(z.any()).optional().default([]),
    note: z.string().max(500, "Note cannot exceed 500 characters").optional().nullable(),
});

export const replaceRestaurantItemsSchema = z.object({
    items: z.array(restaurantItemInputSchema),
});

export const rejectWeightRequestSchema = z.object({
    reason: z.string().max(500, "Reason cannot exceed 500 characters").optional(),
});
