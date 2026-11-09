"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRestaurantOrdersQuerySchema = exports.transferOrderBranchSchema = void 0;
const zod_1 = require("zod");
// ==========================================
// Transfer Order Branch Validation Schema
// ==========================================
exports.transferOrderBranchSchema = zod_1.z
    .object({
    orderId: zod_1.z.string().uuid("Invalid orderId format").optional(),
    branchId: zod_1.z.string().uuid("Invalid branchId format").optional(),
    targetBranchId: zod_1.z.string().uuid("Invalid targetBranchId format").optional(),
    note: zod_1.z.string().max(500, "Note must not exceed 500 characters").optional(),
})
    .refine((data) => !!(data.branchId || data.targetBranchId), {
    message: "Target branch ID (branchId or targetBranchId) is required",
    path: ["branchId"],
});
// ==========================================
// Get Restaurant Orders Query Schema
// ==========================================
const stringOrArray = zod_1.z.union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())]).optional();
exports.getRestaurantOrdersQuerySchema = zod_1.z
    .object({
    branchId: stringOrArray,
    source: zod_1.z.string().optional(),
    orderSource: zod_1.z.string().optional(),
    zoneId: stringOrArray,
    cityId: stringOrArray,
    status: stringOrArray,
    orderStatus: stringOrArray,
    cancelReasonType: zod_1.z.enum(["user", "restaurant"]).optional(),
    canceledType: zod_1.z.enum(["user", "restaurant"]).optional(),
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
    hasDiscount: zod_1.z.string().optional(),
    isPointsRedeemed: zod_1.z.string().optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
    date: zod_1.z.string().optional(),
    orderType: stringOrArray,
    search: zod_1.z.string().optional(),
})
    .passthrough();
