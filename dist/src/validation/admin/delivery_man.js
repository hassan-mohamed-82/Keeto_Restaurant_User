"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeliveryCashOrdersQuerySchema = exports.collectDeliveryCashSchema = exports.getDeliveryOrdersQuerySchema = exports.assignOrdersSchema = void 0;
const zod_1 = require("zod");
// ==========================================
// Delivery Man - Assign Orders Schema
// ==========================================
exports.assignOrdersSchema = zod_1.z.object({
    deliveryManId: zod_1.z
        .string({ required_error: "deliveryManId is required" })
        .uuid("deliveryManId must be a valid UUID"),
    orderIds: zod_1.z
        .array(zod_1.z.string().uuid("Each orderId must be a valid UUID"), { required_error: "orderIds is required" })
        .min(1, "At least one orderId must be provided"),
});
// ==========================================
// Delivery Orders Filter Query Schema
// ==========================================
exports.getDeliveryOrdersQuerySchema = zod_1.z.object({
    deliveryManId: zod_1.z.string().optional(),
    status: zod_1.z.enum(["out_for_delivery", "delivered", "all"]).optional(),
    branchId: zod_1.z.string().optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
});
// ==========================================
// Collect Delivery Cash Schema (POST)
// ==========================================
exports.collectDeliveryCashSchema = zod_1.z.object({
    deliveryManId: zod_1.z
        .string({ required_error: "deliveryManId is required" })
        .uuid("deliveryManId must be a valid UUID"),
    orderIds: zod_1.z
        .array(zod_1.z.string().uuid("Each orderId must be a valid UUID"), { required_error: "orderIds is required" })
        .min(1, "At least one orderId must be provided"),
    note: zod_1.z.string().optional().nullable(),
});
// ==========================================
// Get Delivery Cash Orders Query Schema (GET)
// ==========================================
exports.getDeliveryCashOrdersQuerySchema = zod_1.z.object({
    deliveryManId: zod_1.z.string().optional(),
    isCashCollected: zod_1.z.enum(["true", "false", "all"]).optional(),
    branchId: zod_1.z.string().optional(),
    startDate: zod_1.z.string().optional(),
    endDate: zod_1.z.string().optional(),
});
