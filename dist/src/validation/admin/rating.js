"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ratingRequestIdParamSchema = exports.getRatingRequestsQuerySchema = exports.createRatingRequestSchema = void 0;
const zod_1 = require("zod");
// ==========================================
// 1. Create Rating Moderation Request (Restaurant)
// ==========================================
exports.createRatingRequestSchema = zod_1.z.object({
    targetType: zod_1.z.enum(["restaurant", "order"]).default("restaurant"),
    ratingId: zod_1.z.string().uuid("Invalid rating ID").optional().nullable(),
    orderId: zod_1.z.string().uuid("Invalid order ID").optional().nullable(),
    requestType: zod_1.z.enum(["edit", "delete"], {
        required_error: "requestType is required (edit or delete)",
    }),
    newRating: zod_1.z.coerce.number().int().min(1, "Rating must be at least 1").max(5, "Rating cannot exceed 5").optional().nullable(),
    newComment: zod_1.z.string().optional().nullable(),
    reason: zod_1.z.string({ required_error: "Reason is required" }).min(3, "Reason must be at least 3 characters"),
}).superRefine((data, ctx) => {
    if (data.targetType === "restaurant" && !data.ratingId) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "ratingId is required when targetType is 'restaurant'",
            path: ["ratingId"],
        });
    }
    if (data.targetType === "order" && !data.orderId) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "orderId is required when targetType is 'order'",
            path: ["orderId"],
        });
    }
    if (data.requestType === "edit" && data.newRating === undefined && data.newComment === undefined) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "At least one of newRating or newComment must be provided for edit request",
            path: ["requestType"],
        });
    }
});
// ==========================================
// 2. Query Rating Requests List
// ==========================================
exports.getRatingRequestsQuerySchema = zod_1.z.object({
    status: zod_1.z.enum(["pending", "approved", "rejected", "all"]).optional().default("all"),
    targetType: zod_1.z.enum(["restaurant", "order", "all"]).optional().default("restaurant"),
    page: zod_1.z.coerce.number().int().min(1).optional().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).optional().default(10),
});
// ==========================================
// 3. Request ID Param
// ==========================================
exports.ratingRequestIdParamSchema = zod_1.z.object({
    id: zod_1.z.string().uuid("Invalid request ID"),
});
