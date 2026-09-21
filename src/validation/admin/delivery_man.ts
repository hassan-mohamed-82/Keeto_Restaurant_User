import { z } from "zod";

// ==========================================
// Delivery Man - Assign Orders Schema
// ==========================================

export const assignOrdersSchema = z.object({
    deliveryManId: z
        .string({ required_error: "deliveryManId is required" })
        .uuid("deliveryManId must be a valid UUID"),

    orderIds: z
        .array(
            z.string().uuid("Each orderId must be a valid UUID"),
            { required_error: "orderIds is required" }
        )
        .min(1, "At least one orderId must be provided"),
});

export type AssignOrdersInput = z.infer<typeof assignOrdersSchema>;

// ==========================================
// Delivery Orders Filter Query Schema
// ==========================================

export const getDeliveryOrdersQuerySchema = z.object({
    deliveryManId: z.string().optional(),
    status: z.enum(["out_for_delivery", "delivered", "all"]).optional(),
    branchId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

export type GetDeliveryOrdersQueryInput = z.infer<typeof getDeliveryOrdersQuerySchema>;

// ==========================================
// Collect Delivery Cash Schema (POST)
// ==========================================

export const collectDeliveryCashSchema = z.object({
    deliveryManId: z
        .string({ required_error: "deliveryManId is required" })
        .uuid("deliveryManId must be a valid UUID"),

    orderIds: z
        .array(
            z.string().uuid("Each orderId must be a valid UUID"),
            { required_error: "orderIds is required" }
        )
        .min(1, "At least one orderId must be provided"),

    note: z.string().optional().nullable(),
});

export type CollectDeliveryCashInput = z.infer<typeof collectDeliveryCashSchema>;

// ==========================================
// Get Delivery Cash Orders Query Schema (GET)
// ==========================================

export const getDeliveryCashOrdersQuerySchema = z.object({
    deliveryManId: z.string().optional(),
    isCashCollected: z.enum(["true", "false", "all"]).optional(),
    branchId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

export type GetDeliveryCashOrdersQueryInput = z.infer<typeof getDeliveryCashOrdersQuerySchema>;


