import { z } from "zod";

// ==========================================
// Transfer Order Branch Validation Schema
// ==========================================
export const transferOrderBranchSchema = z
    .object({
        orderId: z.string().uuid("Invalid orderId format").optional(),
        branchId: z.string().uuid("Invalid branchId format").optional(),
        targetBranchId: z.string().uuid("Invalid targetBranchId format").optional(),
        note: z.string().max(500, "Note must not exceed 500 characters").optional(),
    })
    .refine((data) => !!(data.branchId || data.targetBranchId), {
        message: "Target branch ID (branchId or targetBranchId) is required",
        path: ["branchId"],
    });

export type TransferOrderBranchInput = z.infer<typeof transferOrderBranchSchema>;

// ==========================================
// Get Restaurant Orders Query Schema
// ==========================================
export const getRestaurantOrdersQuerySchema = z
    .object({
        branchId: z.string().optional(),
        source: z.string().optional(),
        orderSource: z.string().optional(),
        zoneId: z.string().optional(),
        cityId: z.string().optional(),
        hasDiscount: z.string().optional(),
        isPointsRedeemed: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        date: z.string().optional(),
    })
    .passthrough();

export type GetRestaurantOrdersQueryInput = z.infer<typeof getRestaurantOrdersQuerySchema>;
