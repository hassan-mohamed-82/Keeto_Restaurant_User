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
const stringOrArray = z.union([z.string(), z.array(z.string())]).optional();

export const getRestaurantOrdersQuerySchema = z
    .object({
        branchId: stringOrArray,
        source: z.string().optional(),
        orderSource: z.string().optional(),
        zoneId: stringOrArray,
        cityId: stringOrArray,
        status: z.string().optional(),
        cancelReasonType: z.enum(["user", "restaurant"]).optional(),
        canceledType: z.enum(["user", "restaurant"]).optional(),
        paymentMethod: stringOrArray,
        payment_method: stringOrArray,
        paymentMethods: stringOrArray,
        payment_methods: stringOrArray,
        discountType: stringOrArray,
        discount_type: stringOrArray,
        discountTypes: stringOrArray,
        discount_types: stringOrArray,
        discountSource: stringOrArray,
        discount_source: stringOrArray,
        discountSources: stringOrArray,
        discount_sources: stringOrArray,
        discountId: stringOrArray,
        discount_id: stringOrArray,
        discountIds: stringOrArray,
        discount_ids: stringOrArray,
        couponId: stringOrArray,
        coupon_id: stringOrArray,
        couponIds: stringOrArray,
        coupon_ids: stringOrArray,
        couponCode: stringOrArray,
        coupon_code: stringOrArray,
        firstOrderDiscountId: stringOrArray,
        first_order_discount_id: stringOrArray,
        firstOrderDiscountIds: stringOrArray,
        first_order_discount_ids: stringOrArray,
        hasDiscount: z.string().optional(),
        isPointsRedeemed: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        date: z.string().optional(),
        orderType: stringOrArray,
        search: z.string().optional(),
    })
    .passthrough();

export type GetRestaurantOrdersQueryInput = z.infer<typeof getRestaurantOrdersQuerySchema>;
