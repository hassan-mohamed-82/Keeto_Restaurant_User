import { z } from "zod";

export const deliveryManAssignedOrdersQuerySchema = z.object({
    orderId: z.string().optional(),
    status: z.enum(["all", "pending", "accepted", "preparing", "out_for_delivery"]).optional(),
});

export const deliveryManOrderHistoryQuerySchema = z.object({
    page: z.preprocess((val) => (val ? Number(val) : 1), z.number().int().min(1).default(1)),
    limit: z.preprocess((val) => (val ? Number(val) : 20), z.number().int().min(1).max(100).default(20)),
    status: z.enum(["all", "delivered", "cancelled", "refund"]).optional().default("all"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
});

export const deliveryManUpdateOrderStatusSchema = z.object({
    status: z.literal("delivered", {
        errorMap: () => ({ message: "Delivery man can only update order status to 'delivered'" }),
    }),
});

export type DeliveryManAssignedOrdersQueryInput = z.infer<typeof deliveryManAssignedOrdersQuerySchema>;
export type DeliveryManOrderHistoryQueryInput = z.infer<typeof deliveryManOrderHistoryQuerySchema>;
export type DeliveryManUpdateOrderStatusInput = z.infer<typeof deliveryManUpdateOrderStatusSchema>;
