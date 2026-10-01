import { z } from "zod";

export const deliveryManDashboardQuerySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    period: z.enum(["today", "this_week", "this_month", "all"]).optional(),
});

export type DeliveryManDashboardQueryInput = z.infer<typeof deliveryManDashboardQuerySchema>;
