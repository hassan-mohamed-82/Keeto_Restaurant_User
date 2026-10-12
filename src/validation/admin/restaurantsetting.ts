import { z } from "zod";

export const updateBusyStatusSchema = z.object({
    isBusy: z.boolean().optional(),
    busy: z.boolean().optional(),
    status: z.enum(["busy", "available"]).optional(),
}).refine(
    (data) => data.isBusy !== undefined || data.busy !== undefined || data.status !== undefined,
    {
        message: "You must provide either 'isBusy' (boolean), 'busy' (boolean), or 'status' ('busy' | 'available')",
    }
);
