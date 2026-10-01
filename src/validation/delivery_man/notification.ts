import { z } from "zod";

export const deliveryManNotificationQuerySchema = z.object({
    page: z.preprocess((val) => (val ? Number(val) : 1), z.number().int().min(1).default(1)),
    limit: z.preprocess((val) => (val ? Number(val) : 20), z.number().int().min(1).max(100).default(20)),
    unreadOnly: z.preprocess((val) => val === "true" || val === true, z.boolean().optional()),
    isRead: z.preprocess((val) => val === "true" || val === true ? true : (val === "false" || val === false ? false : undefined), z.boolean().optional()),
});

export type DeliveryManNotificationQueryInput = z.infer<typeof deliveryManNotificationQuerySchema>;
