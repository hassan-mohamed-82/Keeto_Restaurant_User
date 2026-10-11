import { z } from "zod";

// ─── Create ───────────────────────────────────────────────────────────────────
export const createFirstOrderDiscountSchema = z.object({
    name: z.string().trim().min(1, "Name is required").max(255),
    nameAr: z.string().trim().max(255).optional().nullable(),
    nameFr: z.string().trim().max(255).optional().nullable(),

    /** Number of qualifying orders, e.g. 5 = applies to 1st–5th order */
    firstOrderCount: z
        .number({ required_error: "firstOrderCount is required" })
        .int()
        .min(1, "firstOrderCount must be at least 1"),

    discountType: z.enum(["percentage", "fixed"], {
        required_error: "discountType is required",
        invalid_type_error: "discountType must be 'percentage' or 'fixed'",
    }),

    discountValue: z
        .number({ required_error: "discountValue is required" })
        .min(0, "discountValue must be >= 0"),

    /** Optional max cap for percentage discounts */
    maxDiscountAmount: z.number().min(0).optional().nullable(),

    /** Global usage cap (across all users). Omit or null = unlimited */
    maxUsage: z.number().int().min(1).optional().nullable(),

    /** Per-user usage cap. Default: 1 */
    maxUsagePerUser: z.number().int().min(1).default(1),

    startDate: z.string().datetime({ offset: true }).optional().nullable(),
    endDate: z.string().datetime({ offset: true }).optional().nullable(),

    status: z.enum(["active", "inactive"]).default("active"),
});

// ─── Update (all fields optional) ────────────────────────────────────────────
export const updateFirstOrderDiscountSchema = z.object({
    name: z.string().trim().max(255).optional(),
    nameAr: z.string().trim().max(255).optional().nullable(),
    nameFr: z.string().trim().max(255).optional().nullable(),
    firstOrderCount: z.number().int().min(1).optional(),
    discountType: z.enum(["percentage", "fixed"]).optional(),
    discountValue: z.number().min(0).optional(),
    maxDiscountAmount: z.number().min(0).optional().nullable(),
    maxUsage: z.number().int().min(1).optional().nullable(),
    maxUsagePerUser: z.number().int().min(1).optional(),
    startDate: z.string().datetime({ offset: true }).optional().nullable(),
    endDate: z.string().datetime({ offset: true }).optional().nullable(),
    status: z.enum(["active", "inactive"]).optional(),
});
