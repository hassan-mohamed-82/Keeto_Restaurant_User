"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateFirstOrderDiscountSchema = exports.createFirstOrderDiscountSchema = void 0;
const zod_1 = require("zod");
// ─── Create ───────────────────────────────────────────────────────────────────
exports.createFirstOrderDiscountSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, "Name is required").max(255),
    nameAr: zod_1.z.string().trim().max(255).optional().nullable(),
    nameFr: zod_1.z.string().trim().max(255).optional().nullable(),
    /** Number of qualifying orders, e.g. 5 = applies to 1st–5th order */
    firstOrderCount: zod_1.z
        .number({ required_error: "firstOrderCount is required" })
        .int()
        .min(1, "firstOrderCount must be at least 1"),
    discountType: zod_1.z.enum(["percentage", "fixed"], {
        required_error: "discountType is required",
        invalid_type_error: "discountType must be 'percentage' or 'fixed'",
    }),
    discountValue: zod_1.z
        .number({ required_error: "discountValue is required" })
        .min(0, "discountValue must be >= 0"),
    /** Optional max cap for percentage discounts */
    maxDiscountAmount: zod_1.z.number().min(0).optional().nullable(),
    /** Global usage cap (across all users). Omit or null = unlimited */
    maxUsage: zod_1.z.number().int().min(1).optional().nullable(),
    /** Per-user usage cap. Default: 1 */
    maxUsagePerUser: zod_1.z.number().int().min(1).default(1),
    startDate: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    endDate: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    status: zod_1.z.enum(["active", "inactive"]).default("active"),
});
// ─── Update (all fields optional) ────────────────────────────────────────────
exports.updateFirstOrderDiscountSchema = zod_1.z.object({
    name: zod_1.z.string().trim().max(255).optional(),
    nameAr: zod_1.z.string().trim().max(255).optional().nullable(),
    nameFr: zod_1.z.string().trim().max(255).optional().nullable(),
    firstOrderCount: zod_1.z.number().int().min(1).optional(),
    discountType: zod_1.z.enum(["percentage", "fixed"]).optional(),
    discountValue: zod_1.z.number().min(0).optional(),
    maxDiscountAmount: zod_1.z.number().min(0).optional().nullable(),
    maxUsage: zod_1.z.number().int().min(1).optional().nullable(),
    maxUsagePerUser: zod_1.z.number().int().min(1).optional(),
    startDate: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    endDate: zod_1.z.string().datetime({ offset: true }).optional().nullable(),
    status: zod_1.z.enum(["active", "inactive"]).optional(),
});
