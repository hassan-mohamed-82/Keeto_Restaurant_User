import { z } from "zod";

// ==========================================
// 1. Create Rating Moderation Request (Restaurant)
// ==========================================
export const createRatingRequestSchema = z.object({
    targetType: z.enum(["restaurant", "order"]).default("restaurant"),
    ratingId: z.string().uuid("Invalid rating ID").optional().nullable(),
    orderId: z.string().uuid("Invalid order ID").optional().nullable(),
    requestType: z.enum(["edit", "delete"], {
        required_error: "requestType is required (edit or delete)",
    }),
    newRating: z.coerce.number().int().min(1, "Rating must be at least 1").max(5, "Rating cannot exceed 5").optional().nullable(),
    newComment: z.string().optional().nullable(),
    reason: z.string({ required_error: "Reason is required" }).min(3, "Reason must be at least 3 characters"),
}).superRefine((data, ctx) => {
    if (data.targetType === "restaurant" && !data.ratingId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "ratingId is required when targetType is 'restaurant'",
            path: ["ratingId"],
        });
    }

    if (data.targetType === "order" && !data.orderId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "orderId is required when targetType is 'order'",
            path: ["orderId"],
        });
    }

    if (data.requestType === "edit" && data.newRating === undefined && data.newComment === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "At least one of newRating or newComment must be provided for edit request",
            path: ["requestType"],
        });
    }
});

// ==========================================
// 2. Query Rating Requests List
// ==========================================
export const getRatingRequestsQuerySchema = z.object({
    status: z.enum(["pending", "approved", "rejected", "all"]).optional().default("all"),
    targetType: z.enum(["restaurant", "order", "all"]).optional().default("restaurant"),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

// ==========================================
// 3. Request ID Param
// ==========================================
export const ratingRequestIdParamSchema = z.object({
    id: z.string().uuid("Invalid request ID"),
});

export type CreateRatingRequestInput = z.infer<typeof createRatingRequestSchema>;
export type GetRatingRequestsQueryInput = z.infer<typeof getRatingRequestsQuerySchema>;