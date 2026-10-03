"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliveryManUpdateOrderStatusSchema = exports.deliveryManOrderHistoryQuerySchema = exports.deliveryManAssignedOrdersQuerySchema = void 0;
const zod_1 = require("zod");
exports.deliveryManAssignedOrdersQuerySchema = zod_1.z.object({
    orderId: zod_1.z.string().optional(),
    status: zod_1.z.enum(["all", "pending", "accepted", "preparing", "out_for_delivery"]).optional(),
});
exports.deliveryManOrderHistoryQuerySchema = zod_1.z.object({
    page: zod_1.z.preprocess((val) => (val ? Number(val) : 1), zod_1.z.number().int().min(1).default(1)),
    limit: zod_1.z.preprocess((val) => (val ? Number(val) : 20), zod_1.z.number().int().min(1).max(100).default(20)),
    status: zod_1.z.enum(["all", "delivered", "cancelled", "refund"]).optional().default("all"),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
});
exports.deliveryManUpdateOrderStatusSchema = zod_1.z.object({
    status: zod_1.z.literal("delivered", {
        errorMap: () => ({ message: "Delivery man can only update order status to 'delivered'" }),
    }),
});
