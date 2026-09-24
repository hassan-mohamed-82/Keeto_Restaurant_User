import { z } from "zod";

export const reportVisaQuerySchema = z.object({
    status: z.string().optional(),
    paymentStatus: z.string().optional(),
    payment_status: z.string().optional(),
    type: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    branchId: z.string().optional(),
    orderNumber: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
}).passthrough();

export type ReportVisaQueryInput = z.infer<typeof reportVisaQuerySchema>;
