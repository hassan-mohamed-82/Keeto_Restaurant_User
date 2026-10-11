import { z } from "zod";

export const upsertFreeDeliveryOfferSchema = z.object({
    status: z.enum(["active", "inactive"]).optional(),
    minOrderAmount: z.coerce.number().min(0, "minOrderAmount must be a non-negative number").optional(),
    maxOrdersPerUser: z.coerce.number().int().min(1, "maxOrdersPerUser must be at least 1").nullable().optional(),
    startDate: z.string().datetime({ offset: true }).nullable().optional(),
    endDate: z.string().datetime({ offset: true }).nullable().optional(),
});
